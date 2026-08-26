import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { castopodConfigured, listShows } from '@/lib/castopod';
import { logError } from '@/lib/logger';

/**
 * つなぐホスティング(Castopod)の番組一覧。企画作成フォームの配信先ドロップダウン用
 * (#66拡張、2026-08-26)。Castopod連携が未設定の環境では空配列を返す(fail-safe。
 * 従来通り「配信先なし」でプロジェクトを作れる)。
 */
export async function GET(request: NextRequest) {
  const limited = await rateLimit(request, 'api');
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) return apiErrors.unauthorized();

  if (!castopodConfigured()) {
    return withCacheControl(successResponse({ shows: [] }), 'private, no-store');
  }

  try {
    const shows = await listShows();
    return withCacheControl(successResponse({ shows }), 'private, max-age=60');
  } catch (error) {
    logError('Failed to list Castopod shows:', error);
    return apiErrors.internalError('番組一覧の取得に失敗しました');
  }
}
