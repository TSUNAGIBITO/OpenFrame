import { NextRequest } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { consumePasswordResetToken } from '@/lib/password-reset';
import { logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    // Rate-limit by IP — bounds both token-guessing and repeated submit retries
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(`reset-password:${clientIp}`, 'reset-password');
    if (!rateLimitResult.allowed) {
      return apiErrors.rateLimited('リクエストが多すぎます。しばらくしてから再度お試しください。');
    }

    const body = await request.json();
    const { token, password } = body;

    if (!token || typeof token !== 'string') {
      return apiErrors.badRequest('無効なリンクです');
    }
    if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return apiErrors.badRequest('パスワードは 8〜128 文字で入力してください');
    }

    const email = await consumePasswordResetToken(token, password);
    if (!email) {
      return apiErrors.badRequest('リンクが無効か、有効期限が切れています。もう一度パスワード再設定をリクエストしてください。');
    }

    return withCacheControl(
      successResponse({ message: 'パスワードを再設定しました' }),
      'private, no-store'
    );
  } catch (err) {
    logError('Reset password error:', err);
    return apiErrors.internalError('パスワードの再設定に失敗しました');
  }
}
