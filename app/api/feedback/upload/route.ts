import { randomUUID } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { apiErrors, successResponse } from '@/lib/api-response';
import {
  detectImageMime,
  getImageExtension,
  isAllowedImageType,
  normalizeImageMime,
} from '@/lib/image-upload-validation';
import { rateLimit } from '@/lib/rate-limit';
import { r2Client, R2_BUCKET_NAME } from '@/lib/r2';
import { logError } from '@/lib/logger';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_MULTIPART_BODY_SIZE = MAX_FILE_SIZE + 512 * 1024; // file + multipart overhead

// POST /api/feedback/upload
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'feedback-upload');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) {
      return apiErrors.unauthorized('スクリーンショットをアップロードするにはサインインが必要です');
    }

    const contentLength = request.headers.get('content-length');
    if (!contentLength) {
      return apiErrors.badRequest('Content-Length ヘッダーがありません');
    }
    const size = parseInt(contentLength, 10);
    if (Number.isNaN(size) || size <= 0) {
      return apiErrors.badRequest('Content-Length ヘッダーが正しくありません');
    }
    if (size > MAX_MULTIPART_BODY_SIZE) {
      return apiErrors.badRequest('ファイルが大きすぎます。最大サイズは 10MB です。');
    }

    const formData = await request.formData();
    const files = formData.getAll('image');
    if (files.length !== 1) {
      return apiErrors.badRequest('画像ファイルが指定されていません');
    }
    const file = files[0];
    if (!(file instanceof File)) {
      return apiErrors.badRequest('画像ファイルが指定されていません');
    }

    if (file.size > MAX_FILE_SIZE) {
      return apiErrors.badRequest('ファイルが大きすぎます。最大サイズは 10MB です。');
    }

    const normalizedMime = normalizeImageMime(file.type);
    if (normalizedMime && !isAllowedImageType(normalizedMime)) {
      return apiErrors.badRequest(`対応していない画像形式です: ${file.type}`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detectedMime = detectImageMime(buffer);
    if (!detectedMime) {
      return apiErrors.badRequest('アップロードされたファイルの内容が許可された画像形式と一致しません');
    }

    const ext = getImageExtension(detectedMime);
    const filename = `${randomUUID()}.${ext}`;
    const key = `images/${filename}`;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: detectedMime,
      })
    );

    return successResponse({ url: `/api/upload/image/${filename}` }, 201);
  } catch (error) {
    logError('Error uploading feedback screenshot:', error);
    return apiErrors.internalError('スクリーンショットのアップロードに失敗しました');
  }
}
