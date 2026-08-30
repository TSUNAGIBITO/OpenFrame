import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { validateShareLinkAccess, MAX_SHARE_PASSWORD_LENGTH } from '@/lib/share-links';
import { buildReviewMarkersPayload, MARKER_COMMENT_SELECT } from '@/lib/marker-export';

const MAX_EXPORT_COMMENTS = 5000;

// GET /api/integration/review-markers?shareToken=...&videoId=...&includeResolved=true|false&password=...
//
// 共有リンク(プレゼンテーション/動画共有)のトークンを資格情報として、動画の
// アクティブバージョンのレビューコメントを tsunagu-review-markers v1 で返す。
// TsunaguEditor の pull_review_markers ツールが叩く外部連携用エンドポイント。
// セッション不要 — アクセス制御・期限・失効は共有リンク側の仕組みに乗る。
export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'comment-export');
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const shareToken = searchParams.get('shareToken')?.trim() ?? '';
    const videoId = searchParams.get('videoId')?.trim() ?? '';
    if (!shareToken || !videoId) {
      return apiErrors.badRequest('shareToken と videoId が必要です');
    }
    const includeResolved = searchParams.get('includeResolved') !== 'false';
    const presentedPassword = searchParams.get('password') ?? undefined;
    if (presentedPassword && presentedPassword.length > MAX_SHARE_PASSWORD_LENGTH) {
      return apiErrors.badRequest('パスワードが長すぎます');
    }

    const video = await db.video.findUnique({
      where: { id: videoId },
      select: { id: true, title: true, projectId: true },
    });
    if (!video) {
      return apiErrors.notFound('Video');
    }

    const access = await validateShareLinkAccess({
      token: shareToken,
      projectId: video.projectId,
      videoId: video.id,
      requiredPermission: 'VIEW',
      presentedPassword,
    });
    if (!access.hasAccess) {
      // 共有リンクの存在有無は漏らさない(トークン総当たり対策で一律not found)
      return access.requiresPassword
        ? apiErrors.forbidden('この共有リンクはパスワードで保護されています。password パラメータを付けてください')
        : apiErrors.notFound('Share link');
    }

    const version = await db.videoVersion.findFirst({
      where: { videoParentId: video.id, isActive: true },
      orderBy: { versionNumber: 'desc' },
      select: { id: true, versionNumber: true, versionLabel: true },
    });
    if (!version) {
      return apiErrors.notFound('Version');
    }

    const where = {
      versionId: version.id,
      parentId: null,
      ...(includeResolved ? {} : { isResolved: false }),
    };
    const totalComments = await db.comment.count({ where });
    if (totalComments > MAX_EXPORT_COMMENTS) {
      return apiErrors.badRequest(
        `コメントが多すぎます(${totalComments} 件)。取得できるのは最大 ${MAX_EXPORT_COMMENTS} 件です。`
      );
    }

    const comments = await db.comment.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      select: MARKER_COMMENT_SELECT,
    });

    const payload = buildReviewMarkersPayload(comments, {
      videoTitle: video.title,
      videoId: video.id,
      projectId: video.projectId,
      versionNumber: version.versionNumber,
      versionLabel: version.versionLabel,
    });

    const response = Response.json(payload);
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error serving integration review markers:', error);
    return apiErrors.internalError('レビューマーカーの取得に失敗しました');
  }
}
