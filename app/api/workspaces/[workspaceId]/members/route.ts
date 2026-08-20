import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth, checkWorkspaceAccess } from '@/lib/auth';
import { InvitationRole, WorkspaceMemberRole } from '@prisma/client';
import { rateLimit } from '@/lib/rate-limit';
import {
  buildInvitationUrl,
  createOrRefreshInvitation,
  sendInvitationEmail,
} from '@/lib/invitations';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { logError } from '@/lib/logger';
import { isValidEmailAddress, normalizeEmail } from '@/lib/email-validation';

type RouteParams = { params: Promise<{ workspaceId: string }> };

// GET /api/workspaces/[workspaceId]/members - List members
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { workspaceId } = await params;
    const MAX_LIMIT = 100;
    const MAX_PAGE = 1000;
    const MAX_OFFSET = 10000;

    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const searchParams = request.nextUrl.searchParams;
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');

    const pageRaw = pageParam === null ? 1 : Number(pageParam);
    if (!Number.isSafeInteger(pageRaw) || pageRaw < 1 || pageRaw > MAX_PAGE) {
      return apiErrors.badRequest('page が正しくありません。正の整数で指定してください。');
    }

    const limitRaw = limitParam === null ? 20 : Number(limitParam);
    if (!Number.isSafeInteger(limitRaw) || limitRaw < 1 || limitRaw > MAX_LIMIT) {
      return apiErrors.badRequest('limit が正しくありません。1〜100 の正の整数で指定してください。');
    }

    const page = pageRaw;
    const limit = limitRaw;
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip) || skip > MAX_OFFSET) {
      return apiErrors.badRequest('ページ範囲が正しくありません。オフセットは 10000 以下にしてください。');
    }

    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: { where: { userId: session.user.id } },
      },
    });

    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    const access = await checkWorkspaceAccess(
      { id: workspace.id, ownerId: workspace.ownerId },
      session.user.id
    );
    const isOwner = workspace.ownerId === session.user.id;
    const isMember = workspace.members.length > 0;
    const isAdmin = workspace.members[0]?.role === WorkspaceMemberRole.ADMIN;

    if (!access.hasAccess || (!isOwner && !isMember)) {
      return apiErrors.forbidden('アクセスが拒否されました');
    }

    const now = new Date();
    const canViewPendingInvitations = isOwner || isAdmin;
    const [members, total, pendingInvitations] = await Promise.all([
      db.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      db.workspaceMember.count({
        where: { workspaceId },
      }),
      canViewPendingInvitations
        ? db.invitation.findMany({
            where: {
              workspaceId,
              scope: 'WORKSPACE',
              status: 'PENDING',
              expiresAt: { gt: now },
            },
            select: {
              id: true,
              email: true,
              role: true,
              createdAt: true,
              expiresAt: true,
              invitedBy: {
                select: { id: true, name: true, email: true },
              },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    // Include the owner as well
    const owner = await db.user.findUnique({
      where: { id: workspace.ownerId },
      select: { id: true, name: true, email: true, image: true },
    });

    const response = successResponse({ members, owner, pendingInvitations }, 200, {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error fetching workspace members:', error);
    return apiErrors.internalError('メンバーの取得に失敗しました');
  }
}

// POST /api/workspaces/[workspaceId]/members - Invite a member
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'invite-member');
    if (limited) return limited;

    const session = await auth();
    const { workspaceId } = await params;

    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    // Check if user is owner or admin
    const workspace = await db.workspace.findUnique({
      where: { id: workspaceId },
      include: { members: { where: { userId: session.user.id } } },
    });

    if (!workspace) {
      return apiErrors.notFound('Workspace');
    }

    const access = await checkWorkspaceAccess(
      { id: workspace.id, ownerId: workspace.ownerId },
      session.user.id
    );
    const isOwner = workspace.ownerId === session.user.id;
    const isAdmin = workspace.members[0]?.role === WorkspaceMemberRole.ADMIN;

    if (!access.canEdit || (!isOwner && !isAdmin)) {
      return apiErrors.forbidden('メンバーを招待できるのはワークスペースのオーナーと管理者のみです');
    }

    const body = await request.json();
    const { email, role } = body;

    if (!email || typeof email !== 'string') {
      return apiErrors.badRequest('メールアドレスを入力してください');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!isValidEmailAddress(normalizedEmail)) {
      return apiErrors.validationError('メールアドレスの形式が正しくありません');
    }

    // Validate role
    const validRoles = ['ADMIN', 'COMMENTATOR'];
    const memberRole = validRoles.includes(role) ? role : 'COMMENTATOR';

    // If this email belongs to an existing user, validate owner/member conflicts.
    const userToInvite = await db.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (userToInvite?.id === workspace.ownerId) {
      return apiErrors.badRequest('ワークスペースのオーナーをメンバーとして招待することはできません');
    }

    if (userToInvite) {
      const existingMember = await db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: userToInvite.id } },
      });

      if (existingMember) {
        return apiErrors.conflict('このユーザーはすでにワークスペースのメンバーです');
      }
    }

    const invitation = await createOrRefreshInvitation({
      email: normalizedEmail,
      scope: 'WORKSPACE',
      role: memberRole as InvitationRole,
      invitedById: session.user.id,
      workspaceId,
    });

    const invitationUrl = buildInvitationUrl(invitation.token);
    void sendInvitationEmail({
      to: normalizedEmail,
      inviterName: session.user.name || 'A team member',
      role: invitation.role,
      scope: invitation.scope,
      targetName: workspace.name,
      invitationUrl,
    });

    const response = successResponse({ message: 'Invitation email sent.' });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error inviting workspace member:', error);
    return apiErrors.internalError('メンバーの招待に失敗しました');
  }
}
