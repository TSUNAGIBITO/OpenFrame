import { db } from '@/lib/db';
import { logError } from '@/lib/logger';
import { createNotifications } from '@/lib/app-notifications';
import { notifyMentionToSecretary } from '@/lib/secretary-webhook';

const USER_MENTION_REGEX = /@\[(?:.+?)\]\(user:([\w-]+)\)/gi;

export function extractMentionedUserIds(content: string): string[] {
  const ids = new Set<string>();
  for (const match of content.matchAll(USER_MENTION_REGEX)) {
    if (match[1]) ids.add(match[1]);
  }
  return [...ids];
}

/**
 * コメント本文の@[名前](user:id)を解決し、つなぐポータル(secretary経由)へ
 * メンション通知を送る。fire-and-forget前提 — 例外はすべて握りつぶして
 * ログのみ残し、コメント投稿のレスポンスは待たせない。
 *
 * 通知対象はメンション時点でプロジェクトにアクセスできるユーザーのみ
 * (owner / プロジェクトメンバー / ワークスペースメンバー)。本文に任意の
 * user:idを書き込まれても、部外者への通知やメール解決は行わない。
 */
export async function dispatchMentionNotifications(params: {
  content: string | null | undefined;
  authorUserId: string | null;
  authorName: string;
  project: { id: string; ownerId: string; workspaceId: string; name: string };
  videoId: string;
  videoTitle: string;
  timestampLabel: string;
}): Promise<void> {
  try {
    const content = params.content ?? '';
    if (!content) return;

    const mentionedIds = extractMentionedUserIds(content).filter(
      (id) => id !== params.authorUserId
    );
    if (mentionedIds.length === 0) return;

    const users = await db.user.findMany({
      where: {
        id: { in: mentionedIds },
        OR: [
          { id: params.project.ownerId },
          { projectMemberships: { some: { projectId: params.project.id } } },
          { workspaceMemberships: { some: { workspaceId: params.project.workspaceId } } },
        ],
      },
      select: { id: true, name: true, email: true },
    });

    const baseUrl = process.env.NEXTAUTH_URL || '';
    const url = `${baseUrl}/watch/${params.videoId}`;
    // 通知本文にはメンショントークンを名前表記に戻したプレーンテキストを使う
    const plainText = content
      .replace(/@\[(.+?)\]\((?:asset|user):[\w-]+\)/gi, '@$1')
      .slice(0, 200);

    // アプリ内通知(ベルアイコン)。ポータル通知と違いメールアドレスの有無に
    // 依存せず、アクセス権を確認できた全メンション先に配信する(fire-and-forget)
    await createNotifications(
      users.map((user) => ({
        userId: user.id,
        type: 'mention' as const,
        message: `${params.authorName}さんが「${params.videoTitle}」であなたをメンションしました`,
        linkUrl: `/projects/${params.project.id}/videos/${params.videoId}`,
      }))
    );

    await Promise.all(
      users
        .filter((user) => !!user.email)
        .map((user) =>
          notifyMentionToSecretary({
            mentionedEmail: user.email as string,
            mentionedName: user.name ?? '',
            commentAuthor: params.authorName,
            projectName: params.project.name,
            videoTitle: params.videoTitle,
            commentText: plainText,
            timestampLabel: params.timestampLabel,
            url,
          })
        )
    );
  } catch (err) {
    logError('Failed to dispatch mention notifications:', err);
  }
}
