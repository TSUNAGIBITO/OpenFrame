import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth, checkProjectAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { getApprovalCandidatesForProject } from '@/lib/approval-workflow';
import { notifyUsers } from '@/lib/notifications';
import { notifyApprovalRequestToSecretary } from '@/lib/secretary-webhook';
import { rateLimit } from '@/lib/rate-limit';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { logError } from '@/lib/logger';

type RouteParams = { params: Promise<{ versionId: string }> };

function isSerializableConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

// GET /api/versions/[versionId]/approvals
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();

    const { versionId } = await params;
    const version = await db.videoVersion.findUnique({
      where: { id: versionId },
      include: {
        video: {
          include: {
            project: { select: { id: true, ownerId: true, workspaceId: true, visibility: true } },
          },
        },
      },
    });
    if (!version) return apiErrors.notFound('Version');

    const access = await checkProjectAccess(version.video.project, session.user.id);
    const hasMembership = access.isOwner || access.isProjectMember || access.isWorkspaceMember;
    if (!hasMembership) return apiErrors.forbidden('アクセスが拒否されました');

    const requests = await db.approvalRequest.findMany({
      where: { versionId },
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true, image: true } },
        canceledBy: { select: { id: true, name: true, email: true, image: true } },
        decisions: {
          orderBy: { createdAt: 'asc' },
          include: {
            approver: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });

    const response = successResponse({ requests });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error fetching approvals:', error);
    return apiErrors.internalError('承認情報の取得に失敗しました');
  }
}

// POST /api/versions/[versionId]/approvals
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();

    const { versionId } = await params;
    const version = await db.videoVersion.findUnique({
      where: { id: versionId },
      include: {
        video: {
          include: {
            project: {
              select: { id: true, name: true, ownerId: true, workspaceId: true, visibility: true },
            },
          },
        },
      },
    });
    if (!version) return apiErrors.notFound('Version');

    const access = await checkProjectAccess(version.video.project, session.user.id);
    if (!access.canEdit) return apiErrors.forbidden('アクセスが拒否されました');

    const body = (await request.json().catch(() => ({}))) as {
      approverIds?: unknown;
      message?: unknown;
    };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (message.length > 2000) {
      return apiErrors.badRequest('メッセージは 2000 文字以内で入力してください');
    }

    const rawApproverIds = Array.isArray(body.approverIds) ? body.approverIds : [];
    const approverIds = Array.from(
      new Set(
        rawApproverIds
          .filter(
            (approverId): approverId is string =>
              typeof approverId === 'string' && approverId.trim().length > 0
          )
          .map((approverId) => approverId.trim())
      )
    );

    if (approverIds.length === 0) {
      return apiErrors.badRequest('承認者を 1 名以上指定してください');
    }

    if (approverIds.includes(session.user.id)) {
      return apiErrors.badRequest('申請者を承認者にすることはできません');
    }

    const candidates = await getApprovalCandidatesForProject(version.video.project.id);
    if (!candidates) return apiErrors.notFound('Project');
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));

    if (approverIds.some((id) => !candidateIds.has(id))) {
      return apiErrors.badRequest('このプロジェクトの承認者になれない方が含まれています');
    }

    const created = await db.$transaction(
      async (tx) => {
        const existingPending = await tx.approvalRequest.findFirst({
          where: { versionId, status: 'PENDING' },
          select: { id: true },
        });
        if (existingPending) {
          throw new Error('__PENDING_REQUEST_EXISTS__');
        }

        return tx.approvalRequest.create({
          data: {
            versionId,
            requestedById: session.user.id,
            message: message || null,
            decisions: {
              createMany: {
                data: approverIds.map((approverId) => ({
                  approverId,
                  status: 'PENDING',
                })),
              },
            },
          },
          include: {
            requestedBy: { select: { id: true, name: true, email: true, image: true } },
            canceledBy: { select: { id: true, name: true, email: true, image: true } },
            decisions: {
              orderBy: { createdAt: 'asc' },
              include: {
                approver: { select: { id: true, name: true, email: true, image: true } },
              },
            },
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    const requesterName = session.user.name || 'A team member';
    const versionLabel = version.versionLabel || `Version ${version.versionNumber}`;
    const baseUrl = process.env.NEXTAUTH_URL || '';
    const requestUrl = `${baseUrl}/projects/${version.video.project.id}/videos/${version.video.id}`;

    notifyUsers(approverIds, {
      type: 'approval_requested',
      projectName: version.video.project.name,
      videoTitle: version.video.title,
      versionLabel,
      requestedBy: requesterName,
      message: message || undefined,
      url: requestUrl,
    }).catch((error) => {
      logError('Approval request notification failed:', error);
    });

    // いずみさん(Slack Bot)経由の通知+つなぐポータルへのタスク作成(2026-08-26追加)。
    // secretary側の /api/webhooks/openframe-approval に橋渡しするだけで、Notion/Slackの
    // 認証情報はこのアプリには持たせない。env未設定なら関数側でfail-safeに何もしない
    const candidateEmailById = new Map(candidates.map((c) => [c.id, c.email]));
    for (const approverId of approverIds) {
      const approverEmail = candidateEmailById.get(approverId);
      if (!approverEmail) continue;
      notifyApprovalRequestToSecretary({
        approverEmail,
        requesterName,
        projectName: version.video.project.name,
        videoTitle: version.video.title,
        versionLabel,
        message: message || undefined,
        url: requestUrl,
      }).catch((error) => {
        logError('Secretary webhook notification failed:', error);
      });
    }

    const response = successResponse({ request: created }, 201);
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    if (error instanceof Error && error.message === '__PENDING_REQUEST_EXISTS__') {
      return apiErrors.conflict('このバージョンにはすでに保留中の承認リクエストがあります');
    }
    if (isSerializableConflict(error)) {
      return apiErrors.conflict('リクエストの状態が変わりました。もう一度お試しください。');
    }
    logError('Error creating approval request:', error);
    return apiErrors.internalError('承認リクエストの作成に失敗しました');
  }
}
