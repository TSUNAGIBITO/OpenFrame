'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  linkUrl: string;
  readAt: string | null;
  createdAt: string;
}

const POLL_INTERVAL_MS = 60_000;

/** 「◯分前」形式の日本語相対時刻 */
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}ヶ月前`;
  return `${Math.floor(months / 12)}年前`;
}

/**
 * ヘッダーのベルアイコン。未読バッジ付きで、開くと最新の通知一覧を表示する。
 * 60秒ごと+ドロップダウンを開いたタイミングで再取得する。
 */
export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const json = (await res.json()) as {
        data?: { notifications?: NotificationItem[]; unreadCount?: number };
      };
      setNotifications(json.data?.notifications ?? []);
      setUnreadCount(json.data?.unreadCount ?? 0);
    } catch {
      // ポーリングの一時的な失敗は無視(次回の取得で回復する)
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const timer = setInterval(() => void fetchNotifications(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  const handleOpenChange = (open: boolean) => {
    if (open) void fetchNotifications();
  };

  const markRead = (id: string) => {
    // 楽観的更新 — 失敗しても次回ポーリングでサーバー状態に揃う
    setNotifications((items) =>
      items.map((item) =>
        item.id === id && !item.readAt ? { ...item, readAt: new Date().toISOString() } : item
      )
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    void fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markRead', id }),
    }).catch(() => {});
  };

  const handleItemClick = (item: NotificationItem) => {
    if (!item.readAt) markRead(item.id);
    router.push(item.linkUrl);
  };

  const handleMarkAllRead = () => {
    const now = new Date().toISOString();
    setNotifications((items) =>
      items.map((item) => (item.readAt ? item : { ...item, readAt: now }))
    );
    setUnreadCount(0);
    void fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markAllRead' }),
    }).catch(() => {});
  };

  return (
    <DropdownMenu modal={false} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="通知">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-white"
              aria-label={`未読${unreadCount}件`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-80 min-w-80 rounded-md border bg-popover/98 p-1 shadow-2xl backdrop-blur-md"
      >
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-medium">通知</p>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">未読 {unreadCount} 件</span>
          )}
        </div>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            通知はありません
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => handleItemClick(item)}
                className="flex cursor-pointer items-start gap-2 px-3 py-2.5"
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    item.readAt ? 'bg-transparent' : 'bg-primary'
                  )}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      'line-clamp-3 text-sm leading-snug',
                      item.readAt ? 'text-muted-foreground' : 'font-medium'
                    )}
                  >
                    {item.message}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        {notifications.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleMarkAllRead}
              disabled={unreadCount === 0}
              className="cursor-pointer justify-center text-sm text-muted-foreground"
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              すべて既読にする
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
