import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import {
  createPasswordResetToken,
  isPasswordResetEnabled,
  sendPasswordResetEmail,
} from '@/lib/password-reset';
import { logError } from '@/lib/logger';
import { isValidEmailAddress, normalizeEmail } from '@/lib/email-validation';

export async function POST(request: NextRequest) {
  try {
    if (!isPasswordResetEnabled()) {
      return apiErrors.badRequest('パスワード再設定は現在利用できません(メール送信が未設定です)');
    }

    // Rate-limit by IP to prevent abuse (mirrors resend-verification)
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkRateLimit(`forgot-password:${clientIp}`, 'forgot-password');
    if (!rateLimitResult.allowed) {
      return apiErrors.rateLimited('リクエストが多すぎます。しばらくしてから再度お試しください。');
    }

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return apiErrors.badRequest('有効なメールアドレスを入力してください');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmailAddress(normalizedEmail)) {
      return apiErrors.badRequest('有効なメールアドレスを入力してください');
    }

    // Look up user — always return the same generic success regardless of whether
    // the email exists (or is OAuth-only) to avoid user enumeration.
    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, password: true },
    });

    // Only credentials-auth accounts (password !== null) can reset a password.
    // Sending a reset link for an OAuth-only account would let anyone who controls
    // that inbox add a password login the real owner never set up.
    if (user && user.password) {
      const token = await createPasswordResetToken(normalizedEmail);
      await sendPasswordResetEmail(normalizedEmail, token);
    }

    return withCacheControl(
      successResponse({
        message: 'そのメールアドレスのアカウントが存在する場合、パスワード再設定メールを送信しました',
      }),
      'private, no-store'
    );
  } catch (err) {
    logError('Forgot password error:', err);
    return apiErrors.internalError('リクエストの処理に失敗しました');
  }
}
