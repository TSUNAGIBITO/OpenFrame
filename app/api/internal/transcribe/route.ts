import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors, successResponse } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * 文字起こしワーカー(docker-composeのtranscriberコンテナ)専用の内部API。
 * 認証は TRANSCRIBE_INTERNAL_SECRET の Bearer 固定トークン。未設定なら503
 * (fail-safe: 黙って動かない)。外部公開エンドポイントではない前提だが、
 * 認証はワーカー以外からの呼び出しを常に拒否する。
 *
 * - POST {action:'claim'} : 最古のqueuedジョブを1件claimしてprocessingへ
 * - POST {action:'complete', transcriptId, language, segments} : 結果保存
 * - POST {action:'fail', transcriptId, error} : 失敗記録
 */

function checkAuth(request: NextRequest): NextResponse | null {
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
  return null;
}

type SegmentInput = { start: number; end: number; text: string };

function sanitizeSegments(value: unknown): SegmentInput[] | null {
  if (!Array.isArray(value) || value.length > 20_000) return null;
  const segments: SegmentInput[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { start, end, text } = item as Record<string, unknown>;
    if (typeof start !== 'number' || !Number.isFinite(start) || start < 0) return null;
    if (typeof end !== 'number' || !Number.isFinite(end) || end < start) return null;
    if (typeof text !== 'string') return null;
    segments.push({ start, end, text: text.slice(0, 2000) });
  }
  return segments;
}

export async function POST(request: NextRequest) {
  const authError = checkAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiErrors.badRequest('invalid body');

    if (body.action === 'claim') {
      // 同時に複数ワーカーが居ても二重取得しないようトランザクション内でclaim
      const claimed = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM transcripts WHERE status = 'queued' ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED`
        );
        const row = rows[0];
        if (!row) return null;
        return tx.transcript.update({
          where: { id: row.id },
          data: { status: 'processing', error: null },
          include: { version: { select: { id: true, providerId: true, videoId: true, originalUrl: true } } },
        });
      });

      if (!claimed) return successResponse({ job: null });

      return successResponse({
        job: {
          transcriptId: claimed.id,
          versionId: claimed.version.id,
          providerId: claimed.version.providerId,
          // ワーカーは同一composeネットワーク内から app:3000 の
          // /api/internal/transcribe/media でメディアを取得する
          mediaPath: `/api/internal/transcribe/media?transcriptId=${claimed.id}`,
        },
      });
    }

    if (body.action === 'complete') {
      const transcriptId = typeof body.transcriptId === 'string' ? body.transcriptId : '';
      const segments = sanitizeSegments(body.segments);
      if (!transcriptId || !segments) return apiErrors.badRequest('transcriptId / segments が不正です');
      const language = typeof body.language === 'string' ? body.language.slice(0, 16) : null;
      await db.transcript.update({
        where: { id: transcriptId },
        data: { status: 'done', segments, language, error: null },
      });
      return successResponse({ ok: true });
    }

    if (body.action === 'fail') {
      const transcriptId = typeof body.transcriptId === 'string' ? body.transcriptId : '';
      if (!transcriptId) return apiErrors.badRequest('transcriptId が必要です');
      const message = typeof body.error === 'string' ? body.error.slice(0, 2000) : '不明なエラー';
      await db.transcript.update({
        where: { id: transcriptId },
        data: { status: 'error', error: message },
      });
      return successResponse({ ok: true });
    }

    return apiErrors.badRequest('unknown action');
  } catch (error) {
    logError('Error in transcribe internal API:', error);
    return apiErrors.internalError('internal error');
  }
}
