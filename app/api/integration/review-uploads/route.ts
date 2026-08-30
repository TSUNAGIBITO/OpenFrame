import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { isIntegrationTokenRequest } from '@/lib/integration-api-token';
import { createR2UploadToken } from '@/lib/r2-upload-token';
import {
  abortMultipartVideoUpload,
  createMultipartVideoUpload,
  createPresignedImagePutUrl,
  createPresignedUploadPartUrl,
  createPresignedVideoPutUrl,
} from '@/lib/r2';
import {
  getR2MultipartPartSizeBytes,
  getR2MultipartThresholdBytes,
  isS3VideoUploadsEnabled,
} from '@/lib/feature-flags';
import {
  buildVideoObjectKey,
  getMediaExtensionFromMime,
  resolveMediaContentType,
  videoProxyPathFromFilename,
} from '@/lib/video-upload-validation';
import { logError } from '@/lib/logger';
import {
  enforceStorageQuota,
  getMaxVideoUploadBytesForUser,
  releaseStorageReservation,
  reserveStorageQuota,
  UPLOAD_RESERVATION_PURPOSES,
} from '@/lib/storage-quota';
import { uploadTooLargeMessage } from '@/lib/upload-size';
import { createR2UploadSession } from '@/lib/r2-upload-session';

const VIDEO_RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;
const THUMBNAIL_RESERVE_BYTES = BigInt(512 * 1024);

// 外部連携(TsunaguEditor)からの再納品は動画本体のみ。Podcast 音声等まで
// 機械トークンで開けないよう、Web クライアントより狭い mp4/mov に限定する。
const ALLOWED_INTEGRATION_CONTENT_TYPES = new Set(['video/mp4', 'video/quicktime']);

// POST /api/integration/review-uploads
//
// 修正版の動画を新バージョンとして納品するための R2 直接アップロード
// セッションを発行する。認証は OPENFRAME_INTEGRATION_TOKEN の Bearer トークン
// (lib/integration-api-token.ts)。アップロード完了後は
// POST /api/integration/review-versions で uploadToken/objectKey を確定させる。
//
// このプレサイン/マルチパートの流れは Web クライアントの
// app/api/projects/[projectId]/videos/r2-init/route.ts の POST と同じ契約。
// 会員ルートを不安定にしないため、抽出せず最小限を複製している —
// どちらかを変えるときはもう一方も確認すること。
//
// body: { videoId, fileName, fileSize, contentType }
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    if (!isIntegrationTokenRequest(request)) {
      return apiErrors.unauthorized('連携トークンが無効です');
    }

    if (!isS3VideoUploadsEnabled()) {
      return apiErrors.badRequest('このホストでは S3 への動画アップロードが無効になっています');
    }

    const body = await request.json().catch(() => null);
    const videoId = typeof body?.videoId === 'string' ? body.videoId.trim() : '';
    const fileName = typeof body?.fileName === 'string' ? body.fileName.trim() : '';
    const contentTypeInput = typeof body?.contentType === 'string' ? body.contentType.trim() : '';
    const fileSizeRaw = body?.fileSize;

    if (!videoId) {
      return apiErrors.badRequest('videoId が必要です');
    }
    if (!fileName) {
      return apiErrors.badRequest('fileName が必要です');
    }

    let sizeBytes: bigint;
    try {
      sizeBytes = BigInt(fileSizeRaw);
      if (sizeBytes <= BigInt(0)) {
        return apiErrors.badRequest('fileSize は正の整数である必要があります');
      }
    } catch {
      return apiErrors.badRequest('fileSize は正の整数である必要があります');
    }

    const video = await db.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        projectId: true,
        project: { select: { workspace: { select: { ownerId: true } } } },
      },
    });
    if (!video) {
      return apiErrors.notFound('Video');
    }

    // アップロードの計上・課金先はワークスペースオーナー(会員ルートと同じ)。
    // セッション/トークンの userId もオーナーに揃えることで、確定側
    // (finalizeR2VideoUpload)の userId 照合が成立する。
    const billedUserId = video.project.workspace.ownerId;

    const maxBytes = await getMaxVideoUploadBytesForUser(billedUserId);
    if (sizeBytes > maxBytes) {
      return apiErrors.badRequest(uploadTooLargeMessage(maxBytes));
    }

    const contentType = resolveMediaContentType(fileName, contentTypeInput);
    if (!contentType || !ALLOWED_INTEGRATION_CONTENT_TYPES.has(contentType)) {
      return apiErrors.badRequest('対応していない動画形式です(mp4 / mov のみ)');
    }

    const ext = getMediaExtensionFromMime(contentType);
    if (!ext) {
      return apiErrors.badRequest('対応していない動画形式です(mp4 / mov のみ)');
    }

    const quotaError = await enforceStorageQuota(billedUserId, sizeBytes + THUMBNAIL_RESERVE_BYTES);
    if (quotaError) return quotaError;

    const reserveResult = await reserveStorageQuota(
      billedUserId,
      sizeBytes + THUMBNAIL_RESERVE_BYTES,
      UPLOAD_RESERVATION_PURPOSES.R2_VIDEO,
      VIDEO_RESERVATION_TTL_MS
    );
    if ('error' in reserveResult) return reserveResult.error;

    const fileId = randomUUID();
    const filename = `${fileId}.${ext}`;
    const objectKey = buildVideoObjectKey(filename);
    const proxyUrl = videoProxyPathFromFilename(filename);
    const thumbnailFilename = `${fileId}.jpg`;
    const thumbnailObjectKey = `images/${thumbnailFilename}`;
    const thumbnailProxyUrl = `/api/upload/image/${thumbnailFilename}`;

    const useMultipart = sizeBytes > getR2MultipartThresholdBytes();

    let presignedPutUrl = '';
    let thumbnailPresignedPutUrl: string;
    let multipartUploadId: string | null = null;
    let multipart: {
      uploadId: string;
      partSizeBytes: number;
      parts: Array<{ partNumber: number; url: string }>;
    } | null = null;

    try {
      if (useMultipart) {
        const partSize = getR2MultipartPartSizeBytes();
        const partCount = Number((sizeBytes + partSize - BigInt(1)) / partSize);

        multipartUploadId = await createMultipartVideoUpload(objectKey, contentType);

        try {
          const [parts, thumbnailUrl] = await Promise.all([
            Promise.all(
              Array.from({ length: partCount }, async (_unused, index) => {
                const partNumber = index + 1;
                const url = await createPresignedUploadPartUrl(
                  objectKey,
                  multipartUploadId as string,
                  partNumber
                );
                return { partNumber, url };
              })
            ),
            createPresignedImagePutUrl(thumbnailObjectKey, 'image/jpeg'),
          ]);

          multipart = { uploadId: multipartUploadId, partSizeBytes: Number(partSize), parts };
          thumbnailPresignedPutUrl = thumbnailUrl;
        } catch (error) {
          await abortMultipartVideoUpload(objectKey, multipartUploadId).catch(() => undefined);
          throw error;
        }
      } else {
        [presignedPutUrl, thumbnailPresignedPutUrl] = await Promise.all([
          createPresignedVideoPutUrl(objectKey, contentType, sizeBytes),
          createPresignedImagePutUrl(thumbnailObjectKey, 'image/jpeg'),
        ]);
      }
    } catch (error) {
      await releaseStorageReservation(
        reserveResult.reservationId,
        billedUserId,
        UPLOAD_RESERVATION_PURPOSES.R2_VIDEO
      );
      logError('Failed to create presigned integration video upload URL:', error);
      return apiErrors.internalError('動画アップロードの初期化に失敗しました');
    }

    const uploadJti = randomUUID();
    const expiresAt = new Date(Date.now() + VIDEO_RESERVATION_TTL_MS);
    const uploadSession = await createR2UploadSession({
      userId: billedUserId,
      projectId: video.projectId,
      billedUserId,
      objectKey,
      thumbnailObjectKey,
      declaredSizeBytes: sizeBytes,
      contentType,
      reservationId: reserveResult.reservationId,
      uploadJti,
      expiresAt,
      multipartUploadId,
    });

    const uploadToken = createR2UploadToken({
      userId: billedUserId,
      projectId: video.projectId,
      objectKey,
      sessionId: uploadSession.id,
      tokenId: uploadJti,
      thumbnailObjectKey,
    });

    const response = successResponse({
      presignedPutUrl,
      objectKey,
      proxyUrl,
      uploadToken,
      reservationId: reserveResult.reservationId,
      contentType,
      thumbnailPresignedPutUrl,
      thumbnailObjectKey,
      thumbnailProxyUrl,
      multipart,
    });

    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error initializing integration R2 video upload:', error);
    return apiErrors.internalError('アップロードの初期化に失敗しました');
  }
}
