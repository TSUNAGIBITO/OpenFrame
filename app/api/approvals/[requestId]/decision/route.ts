import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth, checkProjectAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifyUsers } from '@/lib/notifications';
import { rateLimit } from '@/lib/rate-limit';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { eventKey, recordEvent } from '@/lib/analytics/record';
import { buildEpisodeAdminUrl, createDraftEpisode, getShowHandle } from '@/lib/castopod';

type RouteParams = { params: Promise<{ requestId: string }> };

function isSerializableConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

// POST /api/approvals/[requestId]/decision
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();

    const { requestId } = await params;
    const body = await request.json().catch(() => ({}));
    const decision = body.decision;
    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      return apiErrors.badRequest('判断は APPROVED または REJECTED である必要があります');
    }

    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 2000) {
      return apiErrors.badRequest('メモは 2000 文字以内で入力してください');
    }

    const approvalRequest = await db.approvalRequest.findUnique({
      where: { id: requestId },
      include: {
        version: {
          include: {
            video: {
              include: {
                project: {
                  select: {
                    id: true,
                    name: true,
                    ownerId: true,
                    workspaceId: true,
                    visibility: true,
                  },
                },
              },
            },
          },
        },
        decisions: {
          where: { approverId: session.user.id },
          select: { id: true, status: true },
        },
      },
    });
    if (!approvalRequest) return apiErrors.notFound('Approval request');

    const access = await checkProjectAccess(approvalRequest.version.video.project, session.user.id);
    if (!access.hasAccess) return apiErrors.forbidden('アクセスが拒否されました');

    const myDecision = approvalRequest.decisions[0];
    if (!myDecision) return apiErrors.forbidden('あなたはこのリクエストの承認者ではありません');
    if (approvalRequest.status !== 'PENDING') {
      return apiErrors.conflict('この承認リクエストはすでに保留中ではありません');
    }
    if (myDecision.status !== 'PENDING') {
      return apiErrors.conflict('このリクエストにはすでに回答済みです');
    }

    const updated = await db.$transaction(
      async (tx) => {
        const currentRequest = await tx.approvalRequest.findUnique({
          where: { id: requestId },
          include: {
            decisions: {
              orderBy: { createdAt: 'asc' },
              include: {
                approver: { select: { id: true, name: true, email: true, image: true } },
              },
            },
            requestedBy: { select: { id: true, name: true, email: true, image: true } },
            version: {
              include: {
                video: {
                  include: {
                    project: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        });
        if (!currentRequest) {
          throw new Error('__NOT_FOUND__');
        }
        if (currentRequest.status !== 'PENDING') {
          throw new Error('__NOT_PENDING__');
        }

        const decisionRow = await tx.approvalDecision.findUnique({
          where: { requestId_approverId: { requestId, approverId: session.user.id } },
          select: { status: true },
        });
        if (!decisionRow) throw new Error('__NOT_APPROVER__');
        if (decisionRow.status !== 'PENDING') throw new Error('__ALREADY_RESPONDED__');

        await tx.approvalDecision.update({
          where: { requestId_approverId: { requestId, approverId: session.user.id } },
          data: {
            status: decision,
            note: note || null,
            respondedAt: new Date(),
          },
        });

        if (decision === 'REJECTED') {
          await tx.approvalRequest.update({
            where: { id: requestId },
            data: {
              status: 'REJECTED',
              resolvedAt: new Date(),
            },
          });
        } else {
          const pendingCount = await tx.approvalDecision.count({
            where: { requestId, status: 'PENDING' },
          });
          const rejectedCount = await tx.approvalDecision.count({
            where: { requestId, status: 'REJECTED' },
          });
          if (pendingCount === 0 && rejectedCount === 0) {
            await tx.approvalRequest.update({
              where: { id: requestId },
              data: {
                status: 'APPROVED',
                resolvedAt: new Date(),
              },
            });
          }
        }

        return tx.approvalRequest.findUnique({
          where: { id: requestId },
          include: {
            requestedBy: { select: { id: true, name: true, email: true, image: true } },
            canceledBy: { select: { id: true, name: true, email: true, image: true } },
            decisions: {
              orderBy: { createdAt: 'asc' },
              include: {
                approver: { select: { id: true, name: true, email: true, image: true } },
              },
            },
            // Scalar fields only: the full version row carries BigInt sizeBytes,
            // which JSON.stringify rejects when serializing the response.
            version: {
              select: {
                id: true,
                versionNumber: true,
                versionLabel: true,
                video: {
                  select: {
                    id: true,
                    title: true,
                    project: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    if (!updated) return apiErrors.notFound('Approval request');

    let castopodTransfer:
      | { status: 'success'; episodeId: string; adminUrl: string | null }
      | { status: 'failed' }
      | undefined;

    const actorName = session.user.name || 'A team member';
    const versionLabel = updated.version.versionLabel || `Version ${updated.version.versionNumber}`;
    const baseUrl = process.env.NEXTAUTH_URL || '';
    const requestUrl = `${baseUrl}/projects/${updated.version.video.project.id}/videos/${updated.version.video.id}`;

    notifyUsers([updated.requestedById], {
      type: 'approval_action',
      projectName: updated.version.video.project.name,
      videoTitle: updated.version.video.title,
      versionLabel,
      actorName,
      action: decision === 'APPROVED' ? 'approved' : 'rejected',
      note: note || undefined,
      url: requestUrl,
    }).catch((error) => {
      logError('Approval action notification failed:', error);
    });

    if (updated.status === 'APPROVED') {
      await recordEvent({
        name: 'APPROVAL_COMPLETED',
        dedupeKey: eventKey('APPROVAL_COMPLETED', requestId),
        userId: approvalRequest.version.video.project.ownerId,
      });

      notifyUsers([updated.requestedById], {
        type: 'approval_completed',
        projectName: updated.version.video.project.name,
        videoTitle: updated.version.video.title,
        versionLabel,
        approvedByCount: updated.decisions.filter((item) => item.status === 'APPROVED').length,
        url: requestUrl,
      }).catch((error) => {
        logError('Approval completed notification failed:', error);
      });

      // つなぐホスティング(Castopod)への転送(#66)。企画作成時に転送先(castopodShowId)を
      // 設定した動画のみ対象。draft作成のみで公開はしない(実際の配信タイミングは
      // Castopod管理画面での人間の判断に委ねる)。失敗しても承認自体は成立済みなので
      // レスポンスは失敗させず、ログのみ残す。
      //
      // 【既知の制約】Castopod側の自前追加APIが音声ファイルの差し替えに対応していないため、
      // 承認のたびに新規draftを作成する(既存draftの更新はしない)。同じ動画を何度も
      // 再承認すると複数draftが積み上がる点は許容する(古い音声のまま静かに残るより安全)。
      //
      // 【2026-08-26修正】'direct' という値は実際には一度も保存されない(スキーマの
      // コメントが古く、実際の値は 'youtube'/'vimeo'/'r2'/'bunny')。判定は「外部動画
      // プラットフォームへのリンクではない(=このアプリへ実体をアップロード済み)」に
      // 修正した。DirectUploadProvider型('bunny'|'r2')と同じ意味。
      const castopodShowId = approvalRequest.version.video.castopodShowId;
      const isDirectlyHostedVersion =
        approvalRequest.version.providerId === 'r2' || approvalRequest.version.providerId === 'bunny';
      if (castopodShowId && isDirectlyHostedVersion) {
        try {
          const episode = await createDraftEpisode({
            castopodShowId,
            videoId: approvalRequest.version.video.id,
            title: updated.version.video.title,
            audioUrl: approvalRequest.version.originalUrl,
          });
          await db.video.update({
            where: { id: approvalRequest.version.video.id },
            data: { castopodEpisodeId: String(episode.id) },
          });
          // 管理画面への直リンクはベストエフォート(取得に失敗しても転送自体は成功扱い。
          // handleが分からない場合はリンク無しでフロント側が成功メッセージのみ表示する)
          let adminUrl: string | null = null;
          try {
            const handle = await getShowHandle(castopodShowId);
            if (handle) adminUrl = buildEpisodeAdminUrl(handle, episode.id);
          } catch (linkError) {
            logError('Castopod admin link resolution failed:', linkError);
          }
          castopodTransfer = { status: 'success', episodeId: String(episode.id), adminUrl };
        } catch (error) {
          logError('Castopod transfer failed:', error);
          castopodTransfer = { status: 'failed' };
        }
      }
    } else if (updated.status === 'REJECTED') {
      notifyUsers([updated.requestedById], {
        type: 'approval_rejected',
        projectName: updated.version.video.project.name,
        videoTitle: updated.version.video.title,
        versionLabel,
        rejectedBy: actorName,
        note: note || undefined,
        url: requestUrl,
      }).catch((error) => {
        logError('Approval rejected notification failed:', error);
      });
    }

    const response = successResponse({ request: updated, castopodTransfer });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === '__NOT_PENDING__')
        return apiErrors.conflict('この承認リクエストはすでに保留中ではありません');
      if (error.message === '__ALREADY_RESPONDED__')
        return apiErrors.conflict('このリクエストにはすでに回答済みです');
      if (error.message === '__NOT_APPROVER__')
        return apiErrors.forbidden('あなたはこのリクエストの承認者ではありません');
      if (error.message === '__NOT_FOUND__') return apiErrors.notFound('Approval request');
    }
    if (isSerializableConflict(error)) {
      return apiErrors.conflict('リクエストの状態が変わりました。もう一度お試しください。');
    }
    logError('Error responding to approval request:', error);
    return apiErrors.internalError('承認リクエストへの回答に失敗しました');
  }
}
