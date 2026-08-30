import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors } from '@/lib/api-response';
import { proxyR2MediaObject, isSafeR2MediaKey } from '@/lib/r2-media-proxy';
import { videoProxyPathToObjectKey } from '@/lib/video-upload-validation';
import { logError } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// 文字起こしワーカー専用のメディア取得口(認証は transcribe と同じ固定Bearer)。
// r2: MinIO/R2から直接ストリーム。direct: 元URLへリダイレクト(ワーカーが追従)
export async function GET(request: NextRequest) {
  const secret = process.env.TRANSCRIBE_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'TRANSCRIBE_INTERNAL_SECRET is not configured' },
      { status: 503 }
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const transcriptId = request.nextUrl.searchParams.get('transcriptId') || '';
    if (!transcriptId) return apiErrors.badRequest('transcriptId が必要です');

    const transcript = await db.transcript.findUnique({
      where: { id: transcriptId },
      include: { version: { select: { providerId: true, videoId: true, originalUrl: true } } },
    });
    if (!transcript) return apiErrors.notFound('Transcript');

    const { providerId, videoId, originalUrl } = transcript.version;

    if (providerId === 'r2') {
      // videoId はオブジェクトキー(videos/<uuid>.<ext>)またはプロキシパスの両対応
      const key = isSafeR2MediaKey(videoId) ? videoId : videoProxyPathToObjectKey(videoId);
      if (!key) return apiErrors.badRequest('メディアキーを解決できませんでした');
      return proxyR2MediaObject({
        request,
        key,
        fallbackContentType: 'application/octet-stream',
        cacheControl: 'private, no-store',
        notFoundLabel: 'Media',
        internalErrorMessage: 'メディアの取得に失敗しました',
      });
    }

    if (providerId === 'direct') {
      if (!/^https?:\/\//.test(originalUrl)) {
        return apiErrors.badRequest('direct動画のURLが不正です');
      }
      return NextResponse.redirect(originalUrl, 302);
    }

    return apiErrors.badRequest('このプロバイダのメディアは取得できません');
  } catch (error) {
    logError('Error serving transcribe media:', error);
    return apiErrors.internalError('メディアの取得に失敗しました');
  }
}
