import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiErrors, withCacheControl } from '@/lib/api-response';
import { rateLimit } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';
import { validateShareLinkAccess, MAX_SHARE_PASSWORD_LENGTH } from '@/lib/share-links';
import { createNotification } from '@/lib/app-notifications';

const MAX_REPLIES_PER_REQUEST = 100;
const MAX_REPLY_TEXT_LENGTH = 2000;
const MAX_AUTHOR_NAME_LENGTH = 50;
const DEFAULT_AUTHOR_NAME = 'TsunaguEditor';

interface ReplyInput {
  commentId: string;
  text: string;
}

// POST /api/integration/review-replies
//
// 共有リンクのトークンを資格情報として、レビューコメントへの返信をまとめて
// 投稿する。TsunaguEditor の「修正済み」報告が review-markers(GET)で得た
// マーカーの id に対して返信を付ける外部連携用エンドポイント。
// セッション不要 — アクセス制御は COMMENT 権限付きの共有リンクに乗る。
//
// body: { shareToken, videoId, password?, authorName?, replies: [{ commentId, text }] }
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

    if (!Array.isArray(body.replies) || body.replies.length === 0) {
      return apiErrors.badRequest('replies には 1 件以上の返信が必要です');
    }
    if (body.replies.length > MAX_REPLIES_PER_REQUEST) {
      return apiErrors.badRequest(
        `一度に投稿できる返信は最大 ${MAX_REPLIES_PER_REQUEST} 件です`
      );
    }

    const replies: ReplyInput[] = [];
    for (const entry of body.replies) {
      const commentId = typeof entry?.commentId === 'string' ? entry.commentId.trim() : '';
      const text = typeof entry?.text === 'string' ? entry.text : '';
      if (!commentId) {
        return apiErrors.badRequest('replies の各要素には commentId が必要です');
      }
      if (!text.trim() || text.length > MAX_REPLY_TEXT_LENGTH) {
        return apiErrors.badRequest(
          `返信本文は 1〜${MAX_REPLY_TEXT_LENGTH} 文字で入力してください (commentId: ${commentId})`
        );
      }
      replies.push({ commentId, text: text.trim() });
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
      requiredPermission: 'COMMENT',
      presentedPassword,
    });
    if (!access.hasAccess) {
      // 共有リンクの存在有無は漏らさない(トークン総当たり対策で一律not found)
      return access.requiresPassword
        ? apiErrors.forbidden('この共有リンクはパスワードで保護されています。password パラメータを付けてください')
        : apiErrors.notFound('Share link');
    }

    // 返信先はこの動画のいずれかのバージョンに属する親コメントであること。
    // 返信は親コメントのバージョン・タイムスタンプを引き継ぐ。
    const uniqueCommentIds = [...new Set(replies.map((reply) => reply.commentId))];
    const parents = await db.comment.findMany({
      where: { id: { in: uniqueCommentIds } },
      select: {
        id: true,
        parentId: true,
        timestamp: true,
        versionId: true,
        authorId: true,
        version: { select: { videoParentId: true } },
      },
    });
    const parentById = new Map(parents.map((parent) => [parent.id, parent]));
    const offendingIds = uniqueCommentIds.filter((id) => {
      const parent = parentById.get(id);
      return !parent || parent.parentId !== null || parent.version.videoParentId !== video.id;
    });
    if (offendingIds.length > 0) {
      return apiErrors.badRequest(
        `この動画の親コメントではない commentId が含まれています: ${offendingIds.join(', ')}`
      );
    }

    await db.comment.createMany({
      data: replies.map((reply) => {
        const parent = parentById.get(reply.commentId);
        if (!parent) throw new Error(`Parent comment vanished: ${reply.commentId}`);
        return {
          content: reply.text,
          timestamp: parent.timestamp,
          timestampEnd: null,
          parentId: parent.id,
          authorId: null,
          guestName,
          versionId: parent.versionId,
        };
      }),
    });

    // アプリ内通知(ベルアイコン)は通常のコメント POST の返信分岐と同じ宛先
    // (親コメントの投稿者)へ届ける。バッチなので投稿者ごとに 1 件にまとめる。
    // メール等の外部通知(notifyProjectOwner)と @メンション通知はルートに
    // 深くインライン化されているため、ここでは送らない。
    {
      const videoTitle = video.title || 'Untitled Video';
      const linkUrl = `/projects/${video.projectId}/videos/${video.id}`;
      const notifiedAuthorIds = new Set(
        replies
          .map((reply) => parentById.get(reply.commentId)?.authorId)
          .filter((authorId): authorId is string => !!authorId)
      );
      for (const authorId of notifiedAuthorIds) {
        createNotification({
          userId: authorId,
          type: 'reply',
          message: `${guestName}さんが「${videoTitle}」であなたのコメントに返信しました`,
          linkUrl,
        }).catch((err) => logError('In-app reply notification failed:', err));
      }
    }

    const response = Response.json({ ok: true, replied: replies.length });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error creating integration review replies:', error);
    return apiErrors.internalError('返信の作成に失敗しました');
  }
}
