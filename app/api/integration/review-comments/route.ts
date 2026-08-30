import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { validateShareLinkAccess, MAX_SHARE_PASSWORD_LENGTH } from '@/lib/share-links';
import { createNotification } from '@/lib/app-notifications';

const MAX_COMMENTS_PER_REQUEST = 100;
const MAX_COMMENT_TEXT_LENGTH = 2000;
const MAX_AUTHOR_NAME_LENGTH = 50;
const DEFAULT_AUTHOR_NAME = 'AI一次レビュー';

interface CommentInput {
  time: number;
  timeEnd: number | null;
  text: string;
}

// POST /api/integration/review-comments
//
// 共有リンクのトークンを資格情報として、タイムスタンプ付きのルートコメントを
// まとめて投稿する。TsunaguEditor の AI一次レビュー(誤字・用語辞書チェック)が
// 指摘を新規コメントとして残すための外部連携用エンドポイント。
// review-replies が「既存コメントへの返信」なのに対し、こちらは「新規指摘」。
// セッション不要 — アクセス制御は COMMENT 権限付きの共有リンクに乗る。
//
// body: { shareToken, videoId, password?, authorName?, versionId?,
//         comments: [{ time, timeEnd?, text }] }   // time は秒(小数可)
export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimit(request, 'integration-reply');
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return apiErrors.badRequest('リクエストボディが不正です');
    }

    const shareToken = typeof body.shareToken === 'string' ? body.shareToken.trim() : '';
    const videoId = typeof body.videoId === 'string' ? body.videoId.trim() : '';
    if (!shareToken || !videoId) {
      return apiErrors.badRequest('shareToken と videoId が必要です');
    }

    const presentedPassword = typeof body.password === 'string' ? body.password : undefined;
    if (presentedPassword && presentedPassword.length > MAX_SHARE_PASSWORD_LENGTH) {
      return apiErrors.badRequest('パスワードが長すぎます');
    }

    let guestName = DEFAULT_AUTHOR_NAME;
    if (body.authorName !== undefined && body.authorName !== null) {
      if (typeof body.authorName !== 'string') {
        return apiErrors.badRequest('authorName は文字列で入力してください');
      }
      const trimmed = body.authorName.trim();
      if (trimmed.length > MAX_AUTHOR_NAME_LENGTH) {
        return apiErrors.badRequest(
          `authorName は ${MAX_AUTHOR_NAME_LENGTH} 文字以内で入力してください`
        );
      }
      if (trimmed) guestName = trimmed;
    }

    if (!Array.isArray(body.comments) || body.comments.length === 0) {
      return apiErrors.badRequest('comments には 1 件以上のコメントが必要です');
    }
    if (body.comments.length > MAX_COMMENTS_PER_REQUEST) {
      return apiErrors.badRequest(
        `一度に投稿できるコメントは最大 ${MAX_COMMENTS_PER_REQUEST} 件です`
      );
    }

    const comments: CommentInput[] = [];
    for (const entry of body.comments) {
      const time = typeof entry?.time === 'number' && Number.isFinite(entry.time) ? entry.time : null;
      const text = typeof entry?.text === 'string' ? entry.text : '';
      if (time === null || time < 0) {
        return apiErrors.badRequest('comments の各要素には 0 以上の time(秒)が必要です');
      }
      let timeEnd: number | null = null;
      if (entry?.timeEnd !== undefined && entry?.timeEnd !== null) {
        if (typeof entry.timeEnd !== 'number' || !Number.isFinite(entry.timeEnd) || entry.timeEnd <= time) {
          return apiErrors.badRequest('timeEnd は time より大きい秒数で入力してください');
        }
        timeEnd = entry.timeEnd;
      }
      if (!text.trim() || text.length > MAX_COMMENT_TEXT_LENGTH) {
        return apiErrors.badRequest(
          `コメント本文は 1〜${MAX_COMMENT_TEXT_LENGTH} 文字で入力してください (time: ${time})`
        );
      }
      comments.push({ time, timeEnd, text: text.trim() });
    }

    const video = await db.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        title: true,
        projectId: true,
        project: { select: { ownerId: true } },
      },
    });
    if (!video) {
      return apiErrors.notFound('Video');
    }

    const access = await validateShareLinkAccess({
      token: shareToken,
      projectId: video.projectId,
      videoId: video.id,
      requiredPermission: 'COMMENT',
      presentedPassword,
    });
    if (!access.hasAccess) {
      // 共有リンクの存在有無は漏らさない(トークン総当たり対策で一律not found)
      return access.requiresPassword
        ? apiErrors.forbidden('この共有リンクはパスワードで保護されています。password パラメータを付けてください')
        : apiErrors.notFound('Share link');
    }

    // 投稿先バージョン: 指定があればこの動画のもののみ許可、省略時はアクティブ版
    let versionId = typeof body.versionId === 'string' ? body.versionId.trim() : '';
    if (versionId) {
      const version = await db.videoVersion.findFirst({
        where: { id: versionId, videoParentId: video.id },
        select: { id: true },
      });
      if (!version) {
        return apiErrors.badRequest('versionId がこの動画のバージョンではありません');
      }
    } else {
      const active = await db.videoVersion.findFirst({
        where: { videoParentId: video.id, isActive: true },
        orderBy: { versionNumber: 'desc' },
        select: { id: true },
      });
      if (!active) {
        return apiErrors.notFound('Active version');
      }
      versionId = active.id;
    }

    await db.comment.createMany({
      data: comments.map((comment) => ({
        content: comment.text,
        timestamp: comment.time,
        timestampEnd: comment.timeEnd,
        parentId: null,
        authorId: null,
        guestName,
        versionId,
      })),
    });

    // アプリ内通知(ベルアイコン)は通常のルートコメントと同じ宛先(プロジェクト
    // オーナー)へ。バッチなのでリクエスト全体で 1 件にまとめる。メール等の外部
    // 通知はルートに深くインライン化されているため、ここでは送らない。
    {
      const videoTitle = video.title || 'Untitled Video';
      createNotification({
        userId: video.project.ownerId,
        type: 'new_comment',
        message: `${guestName}さんが「${videoTitle}」に ${comments.length} 件のコメントを残しました`,
        linkUrl: `/projects/${video.projectId}/videos/${video.id}`,
      }).catch((err) => logError('In-app integration comment notification failed:', err));
    }

    const response = Response.json({ ok: true, commented: comments.length, versionId });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error creating integration review comments:', error);
    return apiErrors.internalError('コメントの作成に失敗しました');
  }
}
