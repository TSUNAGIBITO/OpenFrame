import { NextRequest } from 'next/server';
import { auth, checkProjectAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { rateLimit } from '@/lib/rate-limit';
import { validateShareLinkAccess } from '@/lib/share-links';
import { getShareSessionFromRequest } from '@/lib/share-session';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import {
  detectImageMime,
  getImageExtension,
  isAllowedImageType,
  normalizeImageMime,
} from '@/lib/image-upload-validation';
import {
  deriveGuestUploadContext,
  enforceGuestUploadQuota,
  verifyGuestUploadToken,
} from '@/lib/guest-upload-token';
import { logError } from '@/lib/logger';
import {
  reserveStorageQuota,
  releaseStorageReservation,
  UPLOAD_RESERVATION_PURPOSES,
} from '@/lib/storage-quota';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_MULTIPART_BODY_SIZE = MAX_FILE_SIZE + 512 * 1024; // file + multipart overhead

export async function POST(request: NextRequest) {
  try {
    // Check Content-Length header BEFORE loading the file
    const contentLength = request.headers.get('content-length');
    if (!contentLength) {
      return apiErrors.badRequest('Content-Length ヘッダーがありません');
    }
    const bodySize = parseInt(contentLength, 10);
    if (isNaN(bodySize) || bodySize <= 0) {
      return apiErrors.badRequest('Content-Length ヘッダーが正しくありません');
    }
    if (bodySize > MAX_MULTIPART_BODY_SIZE) {
      return apiErrors.badRequest('ファイルが大きすぎます。最大サイズは 10MB です。');
    }

    // Rate limit
    const limited = await rateLimit(request, 'image-upload');
    if (limited) return limited;

    const session = await auth();

    const formData = await request.formData();
    const files = formData.getAll('image');
    if (files.length !== 1) {
      return apiErrors.badRequest('画像ファイルが指定されていません');
    }
    const file = files[0];
    const videoId = formData.get('videoId');
    const uploadToken = formData.get('uploadToken');

    if (!(file instanceof File)) {
      return apiErrors.badRequest('画像ファイルが指定されていません');
    }
    if (typeof videoId !== 'string' || !videoId.trim()) {
      return apiErrors.badRequest('videoId が必要です');
    }

    const safeVideoId = videoId.trim();
    const video = await db.video.findUnique({
      where: { id: safeVideoId },
      include: {
        project: {
          include: { workspace: { select: { ownerId: true } } },
        },
      },
    });
    if (!video) {
      return apiErrors.notFound('Video');
    }

    const access = await checkProjectAccess(video.project, session?.user?.id);
    const shareSession = getShareSessionFromRequest(request, safeVideoId);
    const shareAccess = shareSession
      ? await validateShareLinkAccess({
          token: shareSession.token,
          projectId: video.projectId,
          videoId: safeVideoId,
          requiredPermission: 'COMMENT',
          passwordVerified: shareSession.passwordVerified,
        })
      : {
          hasAccess: false,
          canComment: false,
          canDownload: false,
          allowGuests: false,
          requiresPassword: false,
        };
    const canCommentWithMembership = !!session?.user?.id && access.hasAccess;
    const canCommentWithShareLink =
      shareAccess.canComment && (session?.user?.id ? true : shareAccess.allowGuests);
    if (!canCommentWithMembership && !canCommentWithShareLink) {
      return apiErrors.forbidden('アクセスが拒否されました');
    }

    if (!session?.user?.id) {
      if (typeof uploadToken !== 'string' || !uploadToken.trim()) {
        return apiErrors.badRequest('ゲストのアップロードには uploadToken が必要です');
      }

      const expectedContext = deriveGuestUploadContext(request, shareSession?.token ?? null);
      if (!expectedContext) {
        return apiErrors.forbidden('信頼できるクライアント IP ヘッダーがありません');
      }

      const isValidUploadToken = verifyGuestUploadToken(uploadToken.trim(), {
        projectId: video.projectId,
        videoId: safeVideoId,
        intent: 'image',
        context: expectedContext,
      });
      if (!isValidUploadToken) {
        return apiErrors.forbidden('アップロードトークンが無効です');
      }

      const quotaError = await enforceGuestUploadQuota(
        request,
        safeVideoId,
        'image',
        shareSession?.token ?? null
      );
      if (quotaError) return quotaError;
    }

    // Double-check file size (defense in depth - Content-Length can be spoofed)
    if (file.size > MAX_FILE_SIZE) {
      return apiErrors.badRequest('ファイルが大きすぎます。最大サイズは 10MB です。');
    }

    // Enforce per-user storage quota before uploading.
    // All paths use the advisory-locked reservation so concurrent uploads always
    // see each other's in-flight sizes, eliminating the TOCTOU race.
    const workspaceOwnerId = video.project.workspace.ownerId;
    const reserveResult = await reserveStorageQuota(
      workspaceOwnerId,
      BigInt(file.size),
      UPLOAD_RESERVATION_PURPOSES.IMAGE
    );
    if ('error' in reserveResult) return reserveResult.error;
    const reservationId = reserveResult.reservationId;

    // Check content type
    const normalizedMime = normalizeImageMime(file.type);
    if (normalizedMime && !isAllowedImageType(normalizedMime)) {
      await releaseStorageReservation(
        reservationId,
        workspaceOwnerId,
        UPLOAD_RESERVATION_PURPOSES.IMAGE
      );
      return apiErrors.badRequest(`対応していない画像形式です: ${file.type}`);
    }

    // Convert to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const detectedMime = detectImageMime(buffer);
    if (!detectedMime) {
      await releaseStorageReservation(
        reservationId,
        workspaceOwnerId,
        UPLOAD_RESERVATION_PURPOSES.IMAGE
      );
      return apiErrors.badRequest('アップロードされたファイルの内容が許可された画像形式と一致しません');
    }

    // Generate unique filename
    const ext = getImageExtension(detectedMime);
    const filename = `${randomUUID()}.${ext}`;
    const key = `images/${filename}`;

    try {
      // Upload to R2
      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET_NAME,
          Key: key,
          Body: buffer,
          ContentType: detectedMime,
        })
      );
    } catch (uploadError) {
      await releaseStorageReservation(
        reservationId,
        workspaceOwnerId,
        UPLOAD_RESERVATION_PURPOSES.IMAGE
      );
      throw uploadError;
    }

    // Return the URL through our proxy endpoint
    const imageUrl = `/api/upload/image/${filename}`;

    const response = successResponse({ url: imageUrl, reservationId }, 201);
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error uploading image:', error);
    return apiErrors.internalError('画像のアップロードに失敗しました');
  }
}
