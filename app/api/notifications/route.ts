import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiErrors, successResponse, withCacheControl } from '@/lib/api-response';
import { logError } from '@/lib/logger';

// ベルのドロップダウンに出す件数。全件表示ではなく「最近の通知」のみ
const NOTIFICATION_LIST_LIMIT = 20;

// GET /api/notifications
// 自分宛の最新通知(未読優先・新しい順)と未読件数を返す
export async function GET(_request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();

    const userId = session.user.id;
    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId },
        // 未読(readAt = null)を先頭に、それぞれ新しい順
        orderBy: [{ readAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
        take: NOTIFICATION_LIST_LIMIT,
        select: {
          id: true,
          type: true,
          message: true,
          linkUrl: true,
          readAt: true,
          createdAt: true,
        },
      }),
      db.notification.count({ where: { userId, readAt: null } }),
    ]);

    const response = successResponse({ notifications, unreadCount });
    return withCacheControl(response, 'private, no-store');
  } catch (error) {
    logError('Error fetching notifications:', error);
    return apiErrors.internalError('通知の取得に失敗しました');
  }
}

// PATCH /api/notifications
// { action: 'markAllRead' } または { action: 'markRead', id }
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return apiErrors.unauthorized();

    const userId = session.user.id;
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      id?: unknown;
    };

    if (body.action === 'markAllRead') {
      await db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      return withCacheControl(successResponse({ ok: true }), 'private, no-store');
    }

    if (body.action === 'markRead') {
      if (typeof body.id !== 'string' || body.id.length === 0) {
        return apiErrors.badRequest('通知IDを指定してください');
      }
      // userId を where に含めることで他人の通知は既読化できない
      await db.notification.updateMany({
        where: { id: body.id, userId, readAt: null },
        data: { readAt: new Date() },
      });
      return withCacheControl(successResponse({ ok: true }), 'private, no-store');
    }

    return apiErrors.badRequest('action は markAllRead または markRead である必要があります');
  } catch (error) {
    logError('Error updating notifications:', error);
    return apiErrors.internalError('通知の更新に失敗しました');
  }
}
