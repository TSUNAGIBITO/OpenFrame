import { db } from '@/lib/db';
import { logError } from '@/lib/logger';

/**
 * アプリ内通知(ヘッダーのベルアイコン)の作成ヘルパー。
 *
 * Telegram/メール等の外部通知(lib/notifications.ts)とは独立した仕組みで、
 * 通知設定に関係なく常にDBへ書き込む。どちらの関数も fire-and-forget 前提 —
 * 失敗してもログを残すだけで決して throw せず、呼び出し元のレスポンスを
 * 失敗させない。
 */

export type AppNotificationType =
  | 'mention'
  | 'reply'
  | 'new_comment'
  | 'approval_requested'
  | 'approval_decided';

export interface AppNotificationInput {
  /** 受信者のユーザーID */
  userId: string;
  type: AppNotificationType;
  /** 表示文(日本語で組み立て済み) */
  message: string;
  /** 遷移先(/projects/... or /watch/...) */
  linkUrl: string;
}

/** アプリ内通知を1件作成する。失敗してもログのみで、決して throw しない。 */
export async function createNotification(input: AppNotificationInput): Promise<void> {
  try {
    await db.notification.create({ data: input });
  } catch (error) {
    logError('Failed to create in-app notification:', error);
  }
}

/** アプリ内通知をまとめて作成する。失敗してもログのみで、決して throw しない。 */
export async function createNotifications(inputs: AppNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await db.notification.createMany({ data: inputs });
  } catch (error) {
    logError('Failed to create in-app notifications:', error);
  }
}
