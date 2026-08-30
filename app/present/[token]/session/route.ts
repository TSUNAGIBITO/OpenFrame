import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { checkRateLimit, getClientIp, rateLimit, rateLimitHeaders } from '@/lib/rate-limit';
import { isTrustedSameOriginRequest } from '@/lib/request-origin';
import {
  MAX_SHARE_PASSWORD_LENGTH,
  isShareLinkExpired,
  validateShareLinkAccess,
} from '@/lib/share-links';
import {
  createProjectShareSessionValue,
  getProjectShareSessionCookieName,
  shareSessionCookieConfig,
} from '@/lib/share-session';

type RouteParams = { params: Promise<{ token: string }> };

function baseCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

function validateSameOriginRequest(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  if (!origin) {
    return NextResponse.json({ error: 'Origin ヘッダーがありません' }, { status: 403 });
  }

  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json({ error: 'クロスオリジンのリクエストは許可されていません' }, { status: 403 });
  }

  return null;
}

// POST /present/[token]/session — プレゼンテーションリンクのパスワードを検証し、
// 署名付き httpOnly クッキー(トークン単位)で解除状態を保持する
export async function POST(request: NextRequest, { params }: RouteParams) {
  const originError = validateSameOriginRequest(request);
  if (originError) return originError;

  const globalLimit = await rateLimit(request, 'share-unlock');
  if (globalLimit) return globalLimit;

  const { token } = await params;

  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === 'string' ? body.password : '';

  if (password.length > MAX_SHARE_PASSWORD_LENGTH) {
    return NextResponse.json({ error: 'パスワードが長すぎます' }, { status: 400 });
  }

  // トークン+IP単位の追加スロットルでパスワード総当たりを抑止する
  const ip = getClientIp(request);
  const tokenFingerprint = createHash('sha256').update(token).digest('hex').slice(0, 24);
  const tokenScopedLimit = await checkRateLimit(
    `${ip}:present-unlock:${tokenFingerprint}`,
    'share-unlock-token',
    { windowMs: 15 * 60 * 1000, maxRequests: 8 }
  );

  if (!tokenScopedLimit.allowed) {
    return NextResponse.json(
      { error: '試行回数が多すぎます。しばらくしてからもう一度お試しください。' },
      {
        status: 429,
        headers: rateLimitHeaders(tokenScopedLimit, 8),
      }
    );
  }

  // プロジェクト全体リンク(videoId=null)のみ受け付ける
  const link = await db.shareLink.findUnique({
    where: { token },
    select: { projectId: true, videoId: true },
  });

  if (!link || link.videoId !== null) {
    return NextResponse.json({ error: '共有リンクが無効です' }, { status: 404 });
  }

  const access = await validateShareLinkAccess({
    token,
    projectId: link.projectId,
    requiredPermission: 'VIEW',
    presentedPassword: password,
  });

  if (!access.hasAccess) {
    const errorMessage = access.requiresPassword
      ? password
        ? 'パスワードが正しくありません'
        : 'パスワードを入力してください'
      : access.link && isShareLinkExpired(access.link)
        ? 'リンクの有効期限が切れています'
        : '共有リンクが無効です';
    const response = NextResponse.json(
      { error: errorMessage, requiresPassword: access.requiresPassword },
      { status: 401 }
    );
    response.cookies.delete(getProjectShareSessionCookieName(token));
    return response;
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(
    getProjectShareSessionCookieName(token),
    createProjectShareSessionValue(token, link.projectId, !!access.link?.passwordHash),
    baseCookieOptions(shareSessionCookieConfig.maxAge)
  );

  return response;
}
