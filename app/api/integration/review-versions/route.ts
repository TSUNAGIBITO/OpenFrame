import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { isIntegrationTokenRequest } from '@/lib/integration-api-token';
import { finalizeR2VideoUpload } from '@/lib/r2-video-finalize';
import { parseR2UploadToken, verifyR2UploadToken } from '@/lib/r2-upload-token';
import { abortMultipartVideoUpload, completeMultipartVideoUpload } from '@/lib/r2';
import { objectKeyToVideoProxyPath } from '@/lib/video-upload-validation';
import { releaseStorageReservation, UPLOAD_RESERVATION_PURPOSES } from '@/lib/storage-quota';
import { logError } from '@/lib/logger';

type IncomingPart = { partNumber: number; etag: string };

// r2-complete/route.ts の parseParts と同じ検証。マルチパート完了は本来
// セッション認証の r2-complete が担うが、機械トークン経路には届かないため
// ここに最小限を複製している。
function parseParts(raw: unknown): IncomingPart[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10000) {
    return null;
  }

  const parts: IncomingPart[] = [];
  const seen = new Set<number>();

  for (const entry of raw) {
    const partNumber = (entry as { partNumber?: unknown })?.partNumber;
    const etag = (entry as { etag?: unknown })?.etag;

    if (
      typeof partNumber !== 'number' ||
      !Number.isInteger(partNumber) ||
      partNumber < 1 ||
      partNumber > 10000 ||
      seen.has(partNumber)
    ) {
      return null;
    }

    if (typeof etag !== 'string' || etag.trim().length === 0) {
      return null;
    }

    seen.add(partNumber);
    parts.push({ partNumber, etag: etag.trim() });
  }

  return parts;
}

// POST /api/integration/review-versions
//
// review-uploads で発行したセッションのアップロード完了後に、そのオブジェクトを
// 新しい VideoVersion として確定する。認証は OPENFRAME_INTEGRATION_TOKEN の
// Bearer トークン(lib/integration-api-token.ts)。
//
// 確定の検証・課金・セッション消費は会員ルート
// app/api/projects/[projectId]/videos/[videoId]/versions/route.ts の POST の
// providerId 'r2' 分岐と同じ流れ(finalizeR2VideoUpload を共用)。会員ルートを
// 不安定にしないため、トランザクション部は最小限を複製している —
// どちらかを変えるときはもう一方も確認すること。
//
// マルチパートアップロード(review-uploads のレスポンスに multipart が付いた場合)
// では、全パート PUT 後に body.parts([{ partNumber, etag }])を渡すと、確定前に
// マルチパートを完了する(Web クライアントの r2-complete 相当)。
//
// body: { videoId, uploadToken, objectKey, versionLabel?, setActive? (default true),
//         parts?: [{ partNumber, etag }] }
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'create-version');
    if (limited) return limited;

    if (!isIntegrationTokenRequest(request)) {
      return apiErrors.unauthorized('連携トークンが無効です');
    }

    const body = await request.json().catch(() => null);
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const uploadToken = typeof body?.uploadToken === 'string' ? body.uploadToken.trim() : '';
    const objectKey = typeof body?.objectKey === 'string' ? body.objectKey.trim() : '';
    const versionLabel = body?.versionLabel;
    const setActive = body?.setActive === undefined ? true : body.setActive === true;

    if (!videoId) {
      return apiErrors.badRequest('videoId が必要です');
    }
    if (!objectKey || !uploadToken) {
      return apiErrors.badRequest('objectKey と uploadToken が必要です');
    }

    if (versionLabel !== undefined && versionLabel !== null) {
      if (typeof versionLabel !== 'string') {
        return apiErrors.badRequest('バージョンラベルは文字列で入力してください');
      }
      if (versionLabel.trim().length > 100) {
        return apiErrors.badRequest('バージョンラベルは 100 文字以内で入力してください');
      }
    }

    const video = await db.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        projectId: true,
        project: { select: { workspace: { select: { ownerId: true } } } },
        versions: { orderBy: { versionNumber: 'desc' }, take: 1, select: { versionNumber: true } },
      },
    });
    if (!video) {
      return apiErrors.notFound('Video');
    }

    // review-uploads はセッションをワークスペースオーナー名義で発行している。
    // finalize の userId 照合もオーナーで通す(課金先と同一)。
    const ownerUserId = video.project.workspace.ownerId;

    const videoUrl = objectKeyToVideoProxyPath(objectKey);
    if (!videoUrl) {
      return apiErrors.badRequest('objectKey が不正です');
    }

    // マルチパートの完了(r2-complete 相当)。parts が来たときだけ通る。
    if (body?.parts !== undefined) {
      const parts = parseParts(body.parts);
      if (!parts) {
        return apiErrors.badRequest(
          'parts は { partNumber, etag } の空でないリストである必要があります'
        );
      }

      const tokenPayload = parseR2UploadToken(uploadToken);
      if (!tokenPayload) {
        return apiErrors.forbidden('アップロードトークンが無効です');
      }
      const isValidUploadToken = verifyR2UploadToken(uploadToken, {
        userId: ownerUserId,
        projectId: video.projectId,
        objectKey,
        sessionId: tokenPayload.sid,
        tokenId: tokenPayload.jti,
      });
      if (!isValidUploadToken) {
        return apiErrors.forbidden('アップロードトークンが無効です');
      }

      const uploadSession = await db.videoUploadSession.findFirst({
        where: {
          id: tokenPayload.sid,
          status: 'INITIATED',
          userId: ownerUserId,
          projectId: video.projectId,
          objectKey,
          uploadJti: tokenPayload.jti,
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          multipartUploadId: true,
          reservationId: true,
          billedUserId: true,
        },
      });
      if (!uploadSession || !uploadSession.multipartUploadId) {
        return apiErrors.forbidden('アップロードトークンが無効です');
      }

      try {
        await completeMultipartVideoUpload(objectKey, uploadSession.multipartUploadId, parts);
      } catch (error) {
        logError('Failed to complete integration R2 multipart upload:', error);
        await abortMultipartVideoUpload(objectKey, uploadSession.multipartUploadId).catch(
          () => undefined
        );
        await db.videoUploadSession.updateMany({
          where: { id: uploadSession.id, status: 'INITIATED' },
          data: { status: 'CANCELLED', consumedAt: new Date() },
        });
        await releaseStorageReservation(
          uploadSession.reservationId,
          uploadSession.billedUserId,
          UPLOAD_RESERVATION_PURPOSES.R2_VIDEO
        );
        return apiErrors.internalError('マルチパートアップロードの完了に失敗しました');
      }
    }

    const finalizeResult = await finalizeR2VideoUpload({
      userId: ownerUserId,
      projectId: video.projectId,
      videoUrl,
      objectKey,
      uploadToken,
    });
    if (!finalizeResult.ok) {
      if (finalizeResult.status === 403) {
        return apiErrors.forbidden(finalizeResult.error);
      }
      return apiErrors.badRequest(finalizeResult.error);
    }

    const nextVersionNumber = (video.versions[0]?.versionNumber || 0) + 1;

    const version = await db.$transaction(
      async (tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]) => {
        if (setActive) {
          await tx.videoVersion.updateMany({
            where: { videoParentId: videoId },
            data: { isActive: false },
          });
        }

        const consumed = await tx.videoUploadSession.updateMany({
          where: {
            id: finalizeResult.sessionId,
            status: 'INITIATED',
            userId: ownerUserId,
            projectId: video.projectId,
            objectKey,
          },
          data: {
            status: 'FINALIZED',
            consumedAt: new Date(),
          },
        });
        if (consumed.count !== 1) {
          throw new Error('Upload session already consumed');
        }
        if (finalizeResult.reservationId) {
          await tx.uploadReservation.deleteMany({
            where: {
              id: finalizeResult.reservationId,
              billedUserId: finalizeResult.billedUserId,
              purpose: UPLOAD_RESERVATION_PURPOSES.R2_VIDEO,
            },
          });
        }

        return tx.videoVersion.create({
          data: {
            versionNumber: nextVersionNumber,
            versionLabel: versionLabel?.trim() || null,
            providerId: 'r2',
            videoId: objectKey,
            originalUrl: videoUrl,
            title: versionLabel?.trim() || `Version ${nextVersionNumber}`,
            thumbnailUrl: finalizeResult.thumbnailProxyUrl,
            duration: null,
            sizeBytes: finalizeResult.sizeBytes,
            isActive: setActive,
            videoParentId: videoId,
          },
          select: { id: true, versionNumber: true },
        });
      }
    );

    const response = Response.json(
      { ok: true, versionId: version.id, versionNumber: version.versionNumber },
      { status: 201 }
    );
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error creating integration review version:', error);
    return apiErrors.internalError('バージョンの作成に失敗しました');
  }
}
