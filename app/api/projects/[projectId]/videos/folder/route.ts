import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { auth, checkProjectAccess } from '@/lib/auth';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { db } from '@/lib/db';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';

type RouteParams = { params: Promise<{ projectId: string }> };

const MAX_BULK_FOLDER = 50;
const MAX_FOLDER_NAME_LENGTH = 80;

// PATCH /api/projects/[projectId]/videos/folder
// プロジェクト内の1つ以上の動画をフォルダ(1階層のラベル)へまとめて割り当てる。
// folder に null を渡すとフォルダから外す(未分類に戻す)。
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const limited = await rateLimit(request, 'mutate');
    if (limited) return limited;

    const session = await auth();
    const { projectId } = await params;

    if (!session?.user?.id) {
      return apiErrors.unauthorized();
    }
    const userId = session.user.id;

    const body = await request.json();
    const { videoIds, folder } = body as { videoIds?: unknown; folder?: unknown };

    if (!Array.isArray(videoIds) || videoIds.length === 0) {
      return apiErrors.badRequest('videoIds は空でない配列である必要があります');
    }
    if (videoIds.length > MAX_BULK_FOLDER) {
      return apiErrors.badRequest(
        `一度にフォルダを設定できる動画は最大 ${MAX_BULK_FOLDER} 本です`
      );
    }
    if (!videoIds.every((id) => typeof id === 'string' && id.trim().length > 0)) {
      return apiErrors.badRequest('各動画 ID は空でない文字列である必要があります');
    }
    if (folder !== null && typeof folder !== 'string') {
      return apiErrors.badRequest('folder は文字列または null である必要があります');
    }

    const folderName = typeof folder === 'string' ? folder.trim() : null;
    if (
      typeof folderName === 'string' &&
      (folderName.length === 0 || folderName.length > MAX_FOLDER_NAME_LENGTH)
    ) {
      return apiErrors.badRequest(
        `フォルダ名は1〜${MAX_FOLDER_NAME_LENGTH}文字で入力してください`
      );
    }

    const normalizedIds = [...new Set(videoIds.map((id) => id.trim()))];

    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, workspaceId: true, visibility: true },
    });
    if (!project) {
      return apiErrors.notFound('Project');
    }

    const access = await checkProjectAccess(project, userId);
    if (!access.canEdit) {
      return apiErrors.forbidden('アクセスが拒否されました');
    }

    // projectId を where に含めることで、他プロジェクトの動画 ID が紛れても
    // 書き換わらない(所属チェックと更新が同一クエリでアトミックに行われる)
    const updated = await db.video.updateMany({
      where: { id: { in: normalizedIds }, projectId },
      data: { folder: folderName },
    });
    if (updated.count !== normalizedIds.length) {
      return apiErrors.badRequest('選択した動画の中にこのプロジェクトに属さないものがあります');
    }

    revalidatePath(`/projects/${projectId}`);

    const response = successResponse({
      message: folderName
        ? `${updated.count}件の動画を「${folderName}」に移動しました`
        : `${updated.count}件の動画をフォルダから外しました`,
      updatedCount: updated.count,
      folder: folderName,
    });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error setting video folder:', error);
    return apiErrors.internalError('フォルダの設定に失敗しました');
  }
}
