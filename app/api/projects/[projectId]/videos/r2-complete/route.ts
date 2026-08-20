import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth, checkProjectAccess } from '@/lib/auth';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { parseR2UploadToken, verifyR2UploadToken } from '@/lib/r2-upload-token';
import { abortMultipartVideoUpload, completeMultipartVideoUpload } from '@/lib/r2';
import { isS3VideoUploadsEnabled } from '@/lib/feature-flags';
import { objectKeyToVideoProxyPath } from '@/lib/video-upload-validation';
import { releaseStorageReservation, UPLOAD_RESERVATION_PURPOSES } from '@/lib/storage-quota';
import { logError } from '@/lib/logger';

type RouteParams = { params: Promise<{ projectId: string }> };

async function getProjectWithEditAccess(projectId: string, userId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      ownerId: true,
      workspaceId: true,
      visibility: true,
      workspace: { select: { ownerId: true } },
    },
  });

  if (!project) return null;

  const access = await checkProjectAccess(project, userId);
  if (!access.canEdit) return null;

  return project;
}

type IncomingPart = { partNumber: number; etag: string };

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

// POST /api/projects/[projectId]/videos/r2-complete
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    const session = await auth();
    const { projectId } = await params;

    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    if (!isS3VideoUploadsEnabled()) {
      return apiErrors.badRequest('このホストでは S3 への動画アップロードが無効になっています');
    }

    const project = await getProjectWithEditAccess(projectId, session.user.id);
    if (!project) {
      return apiErrors.forbidden('アクセスが拒否されました');
    }

    const body = await request.json().catch(() => null);
    const objectKey = typeof body?.objectKey === 'string' ? body.objectKey.trim() : '';
    const uploadToken = typeof body?.uploadToken === 'string' ? body.uploadToken.trim() : '';
    const parts = parseParts(body?.parts);

    if (!objectKey || !uploadToken) {
      return apiErrors.badRequest('objectKey と uploadToken が必要です');
    }

    if (!parts) {
      return apiErrors.badRequest('parts は { partNumber, etag } の空でないリストである必要があります');
    }

    const tokenPayload = parseR2UploadToken(uploadToken);
    if (!tokenPayload) {
      return apiErrors.forbidden('アップロードトークンが無効です');
    }

    const isValidUploadToken = verifyR2UploadToken(uploadToken, {
      userId: session.user.id,
      projectId,
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
        userId: session.user.id,
        projectId,
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

    const proxyUrl = objectKeyToVideoProxyPath(objectKey);
    if (!proxyUrl) {
      return apiErrors.badRequest('オブジェクトキーが正しくありません');
    }

    try {
      await completeMultipartVideoUpload(objectKey, uploadSession.multipartUploadId, parts);
    } catch (error) {
      logError('Failed to complete R2 multipart upload:', error);
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

    const response = successResponse({ objectKey, proxyUrl });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error completing R2 multipart upload:', error);
    return apiErrors.internalError('アップロードの完了に失敗しました');
  }
}
