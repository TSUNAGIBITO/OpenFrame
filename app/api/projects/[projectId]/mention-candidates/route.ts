import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { auth, checkProjectAccess } from '@/lib/auth';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { logError } from '@/lib/logger';

type RouteParams = { params: Promise<{ projectId: string }> };

// GET /api/projects/[projectId]/mention-candidates
// コメントの@メンション候補(プロジェクトにアクセスできるメンバー)を返す。
// メールアドレスは返さない — 通知先の解決はコメント作成時にサーバー側で行う。
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await auth();
    const { projectId } = await params;

    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, workspaceId: true, visibility: true },
    });

    if (!project) {
      return apiErrors.notFound('Project');
    }

    const access = await checkProjectAccess(project, session.user.id);
    if (!access.hasAccess) {
      return apiErrors.forbidden('アクセスが拒否されました');
    }

    const [owner, projectMembers, workspaceMembers] = await Promise.all([
      db.user.findUnique({
        where: { id: project.ownerId },
        select: { id: true, name: true, image: true },
      }),
      db.projectMember.findMany({
        where: { projectId },
        select: { user: { select: { id: true, name: true, image: true } } },
      }),
      db.workspaceMember.findMany({
        where: { workspaceId: project.workspaceId },
        select: { user: { select: { id: true, name: true, image: true } } },
      }),
    ]);

    const seen = new Set<string>();
    const users: { id: string; name: string | null; image: string | null }[] = [];
    for (const user of [
      ...(owner ? [owner] : []),
      ...projectMembers.map((member) => member.user),
      ...workspaceMembers.map((member) => member.user),
    ]) {
      if (seen.has(user.id)) continue;
      seen.add(user.id);
      users.push(user);
    }

    return withCacheControl(successResponse({ users }), 'private, max-age=60');
  } catch (error) {
    logError('Error fetching mention candidates:', error);
    return apiErrors.internalError('メンション候補の取得に失敗しました');
  }
}
