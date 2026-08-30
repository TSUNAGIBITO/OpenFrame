import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { auth, checkProjectAccess } from '@/lib/auth';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { MAX_SHARE_PASSWORD_LENGTH } from '@/lib/share-links';
import { logError } from '@/lib/logger';
import { eventKey, recordEvent } from '@/lib/analytics/record';

type RouteParams = { params: Promise<{ projectId: string; videoId: string }> };

async function requireShareManagementAccess(projectId: string, videoId: string, userId?: string) {
  const video = await db.video.findFirst({
    where: { id: videoId, projectId },
    include: {
      project: true,
    },
  });

  if (!video) {
    return { error: apiErrors.notFound('Video') as Response, video: null };
  }

  const access = await checkProjectAccess(video.project, userId);
  if (!access.canEdit) {
    return { error: apiErrors.forbidden('アクセスが拒否されました') as Response, video: null };
  }

  return { error: null, video };
}

function resolveShareBaseUrl(request: NextRequest): string {
  const configuredBaseUrl = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  const normalizedConfiguredBaseUrl = configuredBaseUrl?.trim();

  if (normalizedConfiguredBaseUrl) {
    const withProtocol = /^https?:\/\//i.test(normalizedConfiguredBaseUrl)
      ? normalizedConfiguredBaseUrl
      : `https://${normalizedConfiguredBaseUrl}`;

    try {
      return new URL(withProtocol).origin;
    } catch {
      // Fallback to request origin when env configuration is invalid.
    }
  }

  return request.nextUrl.origin;
}

// expiresAt の入力値を検証する。null=無期限、ISO文字列=未来日時のみ許可
function parseExpiresAtInput(
  value: unknown
): { ok: true; expiresAt: Date | null } | { ok: false; message: string } {
  if (value === null) {
    return { ok: true, expiresAt: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: '有効期限の形式が正しくありません' };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: '有効期限の形式が正しくありません' };
  }
  if (parsed.getTime() <= Date.now()) {
    return { ok: false, message: '有効期限には未来の日時を指定してください' };
  }
  return { ok: true, expiresAt: parsed };
}

function buildWatchUrl(request: NextRequest, videoId: string, token: string): string {
  const url = new URL(`/watch/${videoId}`, resolveShareBaseUrl(request));
  url.searchParams.set('shareToken', token);
  return url.toString();
}

function serializeShareLink(
  request: NextRequest,
  videoId: string,
  link: {
    id: string;
    token: string;
    permission: string;
    allowGuests: boolean;
    allowDownloads: boolean;
    expiresAt: Date | null;
    createdAt: Date;
    passwordHash: string | null;
  } | null
) {
  if (!link) {
    return { link: null, shareUrl: null };
  }

  return {
    link: {
      id: link.id,
      token: link.token,
      permission: link.permission,
      allowGuests: link.allowGuests,
      allowDownloads: link.allowDownloads,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      hasPassword: !!link.passwordHash,
    },
    shareUrl: buildWatchUrl(request, videoId, link.token),
  };
}

// GET /api/projects/[projectId]/videos/[videoId]/share
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const { projectId, videoId } = await params;
    const { error } = await requireShareManagementAccess(projectId, videoId, session.user.id);
    if (error) return error;

    const link = await db.shareLink.findFirst({
      where: {
        projectId,
        videoId,
        permission: 'COMMENT',
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        token: true,
        permission: true,
        allowGuests: true,
        allowDownloads: true,
        expiresAt: true,
        createdAt: true,
        passwordHash: true,
      },
    });

    const response = successResponse(serializeShareLink(request, videoId, link));

    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error fetching video share link:', error);
    return apiErrors.internalError('動画の共有リンクの取得に失敗しました');
  }
}

// POST /api/projects/[projectId]/videos/[videoId]/share
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const { projectId, videoId } = await params;
    const { error, video } = await requireShareManagementAccess(
      projectId,
      videoId,
      session.user.id
    );
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const allowGuests = typeof body?.allowGuests === 'boolean' ? body.allowGuests : true;
    const allowDownloads = typeof body?.allowDownloads === 'boolean' ? body.allowDownloads : false;
    const password = typeof body?.password === 'string' ? body.password.trim() : '';
    if (password.length > MAX_SHARE_PASSWORD_LENGTH) {
      return apiErrors.badRequest(
        `パスワードは ${MAX_SHARE_PASSWORD_LENGTH} 文字以内で入力してください`
      );
    }
    const passwordHash = password ? await bcrypt.hash(password, 12) : null;

    let expiresAt: Date | null = null;
    if (body?.expiresAt !== undefined) {
      const parsedExpiry = parseExpiresAtInput(body.expiresAt);
      if (!parsedExpiry.ok) {
        return apiErrors.badRequest(parsedExpiry.message);
      }
      expiresAt = parsedExpiry.expiresAt;
    }

    const token = randomBytes(24).toString('base64url');

    let link: {
      id: string;
      token: string;
      permission: string;
      allowGuests: boolean;
      allowDownloads: boolean;
      expiresAt: Date | null;
      createdAt: Date;
      passwordHash: string | null;
    } | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        link = await db.$transaction(
          async (tx) => {
            const existing = await tx.shareLink.findFirst({
              where: {
                projectId,
                videoId,
                permission: 'COMMENT',
              },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            });

            if (existing) {
              return tx.shareLink.update({
                where: { id: existing.id },
                data: {
                  token,
                  allowGuests,
                  allowDownloads,
                  passwordHash,
                  expiresAt,
                },
                select: {
                  id: true,
                  token: true,
                  permission: true,
                  allowGuests: true,
                  allowDownloads: true,
                  expiresAt: true,
                  createdAt: true,
                  passwordHash: true,
                },
              });
            }

            return tx.shareLink.create({
              data: {
                token,
                projectId,
                videoId,
                permission: 'COMMENT',
                allowGuests,
                allowDownloads,
                passwordHash,
                expiresAt,
              },
              select: {
                id: true,
                token: true,
                permission: true,
                allowGuests: true,
                allowDownloads: true,
                expiresAt: true,
                createdAt: true,
                passwordHash: true,
              },
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        ) {
          continue;
        }
        throw error;
      }
    }

    if (!link) {
      return apiErrors.internalError('動画の共有リンクの作成に失敗しました');
    }

    // Keyed on the link id, so re-issuing the token for a link that already
    // exists updates the row and records nothing: the share was created once.
    await recordEvent({
      name: 'SHARE_LINK_CREATED',
      dedupeKey: eventKey('SHARE_LINK_CREATED', link.id),
      userId: video?.project.ownerId ?? null,
    });

    const response = successResponse(serializeShareLink(request, videoId, link));

    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error creating video share link:', error);
    return apiErrors.internalError('動画の共有リンクの作成に失敗しました');
  }
}

// PATCH /api/projects/[projectId]/videos/[videoId]/share
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const { projectId, videoId } = await params;
    const { error } = await requireShareManagementAccess(projectId, videoId, session.user.id);
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const allowGuests = typeof body?.allowGuests === 'boolean' ? body.allowGuests : undefined;
    const allowDownloads =
      typeof body?.allowDownloads === 'boolean' ? body.allowDownloads : undefined;
    const rawPassword = typeof body?.password === 'string' ? body.password : undefined;
    const clearPassword = body?.clearPassword === true;
    if (rawPassword !== undefined && rawPassword.length > MAX_SHARE_PASSWORD_LENGTH) {
      return apiErrors.badRequest(
        `パスワードは ${MAX_SHARE_PASSWORD_LENGTH} 文字以内で入力してください`
      );
    }

    let expiresAtUpdate: Date | null | undefined;
    if (body && typeof body === 'object' && 'expiresAt' in body) {
      const parsedExpiry = parseExpiresAtInput(body.expiresAt);
      if (!parsedExpiry.ok) {
        return apiErrors.badRequest(parsedExpiry.message);
      }
      expiresAtUpdate = parsedExpiry.expiresAt;
    }

    const existing = await db.shareLink.findFirst({
      where: {
        projectId,
        videoId,
        permission: 'COMMENT',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!existing) {
      return apiErrors.notFound('Share link');
    }

    let passwordHashUpdate: string | null | undefined;
    if (clearPassword) {
      passwordHashUpdate = null;
    } else if (rawPassword !== undefined) {
      const trimmedPassword = rawPassword.trim();
      if (trimmedPassword.length > 0) {
        passwordHashUpdate = await bcrypt.hash(trimmedPassword, 12);
      }
    }

    const shouldRotateToken = clearPassword || rawPassword !== undefined;
    const updated = await db.shareLink.update({
      where: { id: existing.id },
      data: {
        ...(allowGuests !== undefined ? { allowGuests } : {}),
        ...(allowDownloads !== undefined ? { allowDownloads } : {}),
        // 有効期限のみの変更ではトークンを再生成しない（既存リンクを維持したまま期限を切り替えられる）
        ...(expiresAtUpdate !== undefined ? { expiresAt: expiresAtUpdate } : {}),
        ...(passwordHashUpdate !== undefined ? { passwordHash: passwordHashUpdate } : {}),
        ...(shouldRotateToken ? { token: randomBytes(24).toString('base64url') } : {}),
      },
      select: {
        id: true,
        token: true,
        permission: true,
        allowGuests: true,
        allowDownloads: true,
        expiresAt: true,
        createdAt: true,
        passwordHash: true,
      },
    });

    const response = successResponse(serializeShareLink(request, videoId, updated));
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error updating video share link:', error);
    return apiErrors.internalError('動画の共有リンクの更新に失敗しました');
  }
}

// DELETE /api/projects/[projectId]/videos/[videoId]/share
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    const session = await auth();
    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const { projectId, videoId } = await params;
    const { error } = await requireShareManagementAccess(projectId, videoId, session.user.id);
    if (error) return error;

    await db.shareLink.deleteMany({
      where: {
        projectId,
        videoId,
        permission: 'COMMENT',
      },
    });

    const response = successResponse({ message: 'Video share link revoked' });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error deleting video share link:', error);
    return apiErrors.internalError('動画の共有リンクの削除に失敗しました');
  }
}
