'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Send,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Globe,
  CreditCard,
  HardDrive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface NotificationSettings {
  telegramChatId: string | null;
  telegramEnabled: boolean;
  emailEnabled: boolean;
  onNewVideo: boolean;
  onNewVersion: boolean;
  onNewComment: boolean;
  onNewReply: boolean;
  onApprovalEvents: boolean;
  timezone: string;
}

interface BillingOverview {
  isEnabled: boolean;
  isConfigured: boolean;
  status: 'disabled' | 'ready' | 'misconfigured';
  checkoutAvailable: boolean;
  portalAvailable: boolean;
  subscription: {
    status: string;
    label: string;
    hasActiveSubscription: boolean;
    hasRecoverableSubscription: boolean;
    hasActiveTrial: boolean;
    hasBillingAccess: boolean;
    isPaid: boolean;
    priceId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    cancelAt: string | null;
    trialEndsAt: string | null;
    billingAccessEndedAt: string | null;
    storageCleanupEligibleAt: string | null;
  };
  workspaceCreation: {
    canCreateWorkspace: boolean;
    reason: string | null;
    ownedWorkspaceCount: number;
    invitedWorkspaceCount: number;
  };
}

interface StorageInfo {
  usedBytes: string;
  limitBytes: string;
  percentage: number;
  /** False on the free trial, where the way out is subscribing rather than deleting. */
  isPaid: boolean;
}

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function ToggleButton({
  enabled,
  onToggle,
  label,
  description,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center justify-between w-full p-3 rounded-lg border transition-colors text-left',
        enabled ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-accent/50'
      )}
    >
      <div className="flex-1 min-w-0 pr-4">
        <span className="text-sm font-medium">{label}</span>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div
        className={cn(
          'w-10 h-6 shrink-0 rounded-full relative transition-colors',
          enabled ? 'bg-primary' : 'bg-muted'
        )}
      >
        <div
          className={cn(
            'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-1'
          )}
        />
      </div>
    </button>
  );
}

export default function SettingsPage({ billingOnly = false }: { billingOnly?: boolean }) {
  const [settings, setSettings] = useState<NotificationSettings>({
    telegramChatId: null,
    telegramEnabled: false,
    emailEnabled: false,
    onNewVideo: true,
    onNewVersion: true,
    onNewComment: true,
    onNewReply: true,
    onApprovalEvents: true,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingAction, setBillingAction] = useState<'checkout' | 'portal' | null>(null);
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state for Telegram chat ID (separate from saved settings for editing)
  const [telegramChatId, setTelegramChatId] = useState('');

  const hasScheduledCancellation = Boolean(
    billing?.subscription.cancelAtPeriodEnd || billing?.subscription.cancelAt
  );

  useEffect(() => {
    async function fetchSettings() {
      try {
        const [settingsRes, billingRes, storageRes] = await Promise.all([
          fetch('/api/settings/notifications'),
          fetch('/api/billing'),
          fetch('/api/settings/storage'),
        ]);

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data.data);
          setTelegramChatId(data.data.telegramChatId || '');
        }

        if (billingRes.ok) {
          const data = await billingRes.json();
          setBilling(data.data);
        }

        if (storageRes.ok) {
          const data = await storageRes.json();
          setStorageInfo(data.data);
        }
      } catch {
        console.error('Failed to fetch settings');
      } finally {
        setLoading(false);
        setBillingLoading(false);
        setStorageLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          telegramChatId: telegramChatId || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data.data);
        showMessage('success', '設定を保存しました');
      } else {
        const data = await res.json();
        showMessage('error', data.error || '保存に失敗しました');
      }
    } catch {
      showMessage('error', '設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [settings, telegramChatId, showMessage]);

  const handleTest = useCallback(
    async (channel: 'telegram' | 'email') => {
      setTesting(channel);
      try {
        const res = await fetch('/api/settings/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel,
            telegramChatId,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          showMessage('success', data.data.message);
        } else {
          showMessage('error', data.error || 'テストに失敗しました');
        }
      } catch {
        showMessage('error', 'テストに失敗しました');
      } finally {
        setTesting(null);
      }
    },
    [telegramChatId, showMessage]
  );

  const handleBillingRedirect = useCallback(
    async (endpoint: '/api/billing/checkout' | '/api/billing/portal') => {
      setBillingAction(endpoint.endsWith('checkout') ? 'checkout' : 'portal');
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();

        if (!res.ok) {
          showMessage('error', data.error || '請求手続きを開けませんでした');
          return;
        }

        window.location.href = data.data.url;
      } catch {
        showMessage('error', '請求手続きを開けませんでした');
      } finally {
        setBillingAction(null);
      }
    },
    [showMessage]
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        <div>
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80 mt-2" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <div className="flex justify-end">
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">設定</h1>
        <p className="text-muted-foreground mt-1">
          {billingOnly ? '請求アクセスを管理します' : '通知設定を管理します'}
        </p>
      </div>

      {/* Status message */}
      {message && (
        <div
          className={cn(
            'flex items-center gap-2 p-3 rounded-lg mb-6 text-sm',
            message.type === 'success'
              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
              : 'bg-destructive/10 text-destructive'
          )}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            請求
          </CardTitle>
          <CardDescription>有料プランとワークスペース作成の権限を管理します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {billingLoading || !billing ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-10 w-44 rounded-md" />
            </div>
          ) : !billing.isEnabled ? (
            <div className="rounded-md border border-muted bg-muted/40 p-4 text-sm text-muted-foreground">
              このホストではStripe請求が無効になっています。この環境ではワークスペースの作成に制限はありません。
            </div>
          ) : !billing.isConfigured ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-400">
              Stripeがまだ設定されていません。請求を利用する前にStripeの環境変数を追加してください。
            </div>
          ) : (
            <>
              {!billing.subscription.hasActiveSubscription &&
              billing.subscription.hasActiveTrial &&
              billing.subscription.trialEndsAt ? (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-2">
                  <p className="text-sm font-semibold">
                    無料トライアルは{' '}
                    {new Date(billing.subscription.trialEndsAt).toLocaleDateString()}
                    まで有効です
                  </p>
                  <p className="text-sm text-muted-foreground">
                    すべての機能が有効で、カード情報の登録は不要です。トライアルではワークスペース1つ・プロジェクト1つが利用できます。サブスクリプションに登録するとすぐに有料期間が始まるため、準備が整うまで急いで登録する必要はありません。
                  </p>
                </div>
              ) : null}

              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">現在のプラン</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {billing.subscription.hasActiveSubscription
                      ? hasScheduledCancellation
                        ? billing.subscription.hasActiveTrial
                          ? 'トライアルはキャンセル済みです。トライアル終了まではアクセスが有効です。'
                          : 'サブスクリプションはキャンセル済みです。現在の請求期間の終了までアクセスが有効です。'
                        : '有料アカウントです。ワークスペースの作成が可能です。'
                      : billing.subscription.hasActiveTrial
                        ? '無料トライアル中です。カード情報は不要です。'
                        : '請求アクセスは終了しています。'}
                  </p>
                </div>
                <Badge
                  variant={billing.subscription.hasActiveSubscription ? 'default' : 'secondary'}
                >
                  {billing.subscription.label}
                </Badge>
              </div>

              {billing.subscription.hasRecoverableSubscription &&
              !billing.subscription.hasActiveSubscription ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  直近のお支払いが完了しませんでした。サブスクリプションを維持するには支払い方法を更新してください。新規に登録すると重複してしまいます。
                </p>
              ) : null}

              {billing.subscription.hasActiveTrial &&
              billing.subscription.trialEndsAt &&
              hasScheduledCancellation ? (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                  アクセスは{new Date(billing.subscription.trialEndsAt).toLocaleDateString()}に終了します。
                </p>
              ) : null}

              {billing.subscription.currentPeriodEnd ? (
                <p className="text-sm text-muted-foreground">
                  {hasScheduledCancellation
                    ? 'サブスクリプションは '
                    : '現在の請求期間は '}
                  {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
                  に終了します。
                </p>
              ) : null}

              {hasScheduledCancellation && billing.subscription.cancelAt ? (
                <p className="text-sm text-muted-foreground">
                  キャンセルは{' '}
                  {new Date(billing.subscription.cancelAt).toLocaleDateString()}
                  に予約されました。
                </p>
              ) : null}

              {/* Deliberately not conditioned on `billingAccessEndedAt`: an account that
                  only ever had the cardless trial never gets one written, and it is exactly
                  that account which most needs to be told its work is still recoverable. */}
              {!billing.subscription.hasBillingAccess &&
              billing.subscription.storageCleanupEligibleAt ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  まだ何も削除されていません。プロジェクトとメディアは{' '}
                  {new Date(billing.subscription.storageCleanupEligibleAt).toLocaleDateString()}
                  まで保持されます。それまでにサブスクリプションに登録すれば、すべてそのまま残ります。
                </p>
              ) : null}

              {!billing.workspaceCreation.canCreateWorkspace ? (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <p className="text-sm font-medium">ワークスペースの作成</p>
                  <p className="text-sm text-muted-foreground">
                    {billing.workspaceCreation.reason || 'ワークスペースをもう1つ作成するにはアップグレードしてください。'}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-3">
                {billing.subscription.hasRecoverableSubscription && billing.portalAvailable ? (
                  <Button
                    onClick={() => handleBillingRedirect('/api/billing/portal')}
                    disabled={billingAction !== null}
                  >
                    {billingAction === 'portal' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ポータルを開いています...
                      </>
                    ) : billing.subscription.hasActiveSubscription ? (
                      'サブスクリプションを管理'
                    ) : (
                      '支払い方法を更新'
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleBillingRedirect('/api/billing/checkout')}
                    disabled={!billing.checkoutAvailable || billingAction !== null}
                  >
                    {billingAction === 'checkout' ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        リダイレクトしています...
                      </>
                    ) : (
                      'Stripeでアップグレード'
                    )}
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {billing?.subscription.hasBillingAccess && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              ストレージ
            </CardTitle>
            <CardDescription>
              動画ファイルとメディア添付の合計使用量
              {storageInfo ? `（上限 ${formatBytes(storageInfo.limitBytes)}）` : ''}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {storageLoading || !storageInfo ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatBytes(storageInfo.limitBytes)}中{' '}
                    {formatBytes(storageInfo.usedBytes)}使用
                  </span>
                  <span
                    className={
                      storageInfo.percentage >= 90
                        ? 'text-destructive font-medium'
                        : storageInfo.percentage >= 75
                          ? 'text-amber-600 dark:text-amber-400 font-medium'
                          : 'text-muted-foreground'
                    }
                  >
                    {storageInfo.percentage < 0.1
                      ? '<0.1%'
                      : `${storageInfo.percentage.toFixed(1)}%`}
                  </span>
                </div>
                <Progress
                  value={storageInfo.percentage}
                  className={
                    storageInfo.percentage >= 90
                      ? '[&>div]:bg-destructive'
                      : storageInfo.percentage >= 75
                        ? '[&>div]:bg-amber-500'
                        : ''
                  }
                />
                {storageInfo.percentage >= 90 &&
                  (storageInfo.isPaid ? (
                    <p className="text-xs text-destructive">
                      ストレージがほぼいっぱいです。不要なファイルを削除するか、サポートにお問い合わせください。
                    </p>
                  ) : (
                    <p className="text-xs text-destructive">
                      無料トライアルのストレージがほぼいっぱいです。上のボタンからサブスクリプションに登録して容量を増やすか、不要なファイルを削除してください。
                    </p>
                  ))}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {!billingOnly && (
        <>
          {/* Event Subscriptions */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                通知イベント
              </CardTitle>
              <CardDescription>どのイベントで通知するかを選択します</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleButton
                enabled={settings.onNewVideo}
                onToggle={() => setSettings((s) => ({ ...s, onNewVideo: !s.onNewVideo }))}
                label="動画が追加されたとき"
                description="いずれかのプロジェクトに新しい動画が追加されたとき"
              />
              <ToggleButton
                enabled={settings.onNewVersion}
                onToggle={() => setSettings((s) => ({ ...s, onNewVersion: !s.onNewVersion }))}
                label="バージョンが追加されたとき"
                description="既存の動画に新しいバージョンが追加されたとき"
              />
              <ToggleButton
                enabled={settings.onNewComment}
                onToggle={() => setSettings((s) => ({ ...s, onNewComment: !s.onNewComment }))}
                label="新しいコメント"
                description="動画に誰かがコメントを残したとき"
              />
              <ToggleButton
                enabled={settings.onNewReply}
                onToggle={() => setSettings((s) => ({ ...s, onNewReply: !s.onNewReply }))}
                label="新しい返信"
                description="コメントスレッドに誰かが返信したとき"
              />
              <ToggleButton
                enabled={settings.onApprovalEvents}
                onToggle={() =>
                  setSettings((s) => ({ ...s, onApprovalEvents: !s.onApprovalEvents }))
                }
                label="承認ワークフロー"
                description="承認リクエストが作成・対応・確定されたとき"
              />
            </CardContent>
          </Card>

          {/* Telegram */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Telegram
                </CardTitle>
                <Badge variant={settings.telegramEnabled ? 'default' : 'secondary'}>
                  {settings.telegramEnabled ? '有効' : '無効'}
                </Badge>
              </div>
              <CardDescription>Telegramで即座に通知を受け取ります</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3 space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">設定手順</p>
                <ol className="space-y-1.5 list-decimal list-inside">
                  <li>
                    Telegramで{' '}
                    <a
                      href="https://t.me/UserInfeBot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      @UserInfeBot
                    </a>{' '}
                    にメッセージを送り、{' '}
                    <code className="bg-muted px-1 rounded text-xs">/start</code> を送信してChat
                    IDを取得します
                  </li>
                  <li>
                    <a
                      href="https://t.me/openframe_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      @openframe_bot
                    </a>{' '}
                    を開始し、<code className="bg-muted px-1 rounded text-xs">/start</code> を送信して、Botがあなたにメッセージを送れるようにします
                  </li>
                  <li>下にChat IDを貼り付けて通知を有効にします</li>
                </ol>
              </div>

              <div>
                <Label htmlFor="telegram-chat-id">あなたのChat ID</Label>
                <Input
                  id="telegram-chat-id"
                  placeholder="123456789"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  className="mt-1 font-mono text-sm"
                />
              </div>

              <ToggleButton
                enabled={settings.telegramEnabled}
                onToggle={() => setSettings((s) => ({ ...s, telegramEnabled: !s.telegramEnabled }))}
                label="Telegram通知を有効にする"
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest('telegram')}
                disabled={!telegramChatId || testing === 'telegram'}
              >
                {testing === 'telegram' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                テストメッセージを送信
              </Button>
            </CardContent>
          </Card>

          {/* Email */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  メール
                </CardTitle>
                <Badge variant={settings.emailEnabled ? 'default' : 'secondary'}>
                  {settings.emailEnabled ? '有効' : '無効'}
                </Badge>
              </div>
              <CardDescription>
                アカウントのメールアドレスに通知メールを受け取ります
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ToggleButton
                enabled={settings.emailEnabled}
                onToggle={() => setSettings((s) => ({ ...s, emailEnabled: !s.emailEnabled }))}
                label="メール通知を有効にする"
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTest('email')}
                disabled={!settings.emailEnabled || testing === 'email'}
              >
                {testing === 'email' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                テストメールを送信
              </Button>
            </CardContent>
          </Card>

          {/* Timezone */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                タイムゾーン
              </CardTitle>
              <CardDescription>通知内のタイムスタンプにこのタイムゾーンを使用します</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={settings.timezone}
                onValueChange={(value) => setSettings((s) => ({ ...s, timezone: value }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="タイムゾーンを選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>南北アメリカ</SelectLabel>
                    <SelectItem value="America/New_York">東部時間（ニューヨーク）</SelectItem>
                    <SelectItem value="America/Chicago">中部時間（シカゴ）</SelectItem>
                    <SelectItem value="America/Denver">山岳部時間（デンバー）</SelectItem>
                    <SelectItem value="America/Los_Angeles">太平洋時間（ロサンゼルス）</SelectItem>
                    <SelectItem value="America/Anchorage">アラスカ（アンカレッジ）</SelectItem>
                    <SelectItem value="Pacific/Honolulu">ハワイ（ホノルル）</SelectItem>
                    <SelectItem value="America/Toronto">トロント</SelectItem>
                    <SelectItem value="America/Vancouver">バンクーバー</SelectItem>
                    <SelectItem value="America/Mexico_City">メキシコシティ</SelectItem>
                    <SelectItem value="America/Sao_Paulo">サンパウロ</SelectItem>
                    <SelectItem value="America/Argentina/Buenos_Aires">ブエノスアイレス</SelectItem>
                    <SelectItem value="America/Bogota">ボゴタ</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>ヨーロッパ</SelectLabel>
                    <SelectItem value="Europe/London">ロンドン (GMT/BST)</SelectItem>
                    <SelectItem value="Europe/Paris">パリ (CET)</SelectItem>
                    <SelectItem value="Europe/Berlin">ベルリン (CET)</SelectItem>
                    <SelectItem value="Europe/Amsterdam">アムステルダム (CET)</SelectItem>
                    <SelectItem value="Europe/Madrid">マドリード (CET)</SelectItem>
                    <SelectItem value="Europe/Rome">ローマ (CET)</SelectItem>
                    <SelectItem value="Europe/Zurich">チューリッヒ (CET)</SelectItem>
                    <SelectItem value="Europe/Stockholm">ストックホルム (CET)</SelectItem>
                    <SelectItem value="Europe/Helsinki">ヘルシンキ (EET)</SelectItem>
                    <SelectItem value="Europe/Athens">アテネ (EET)</SelectItem>
                    <SelectItem value="Europe/Istanbul">イスタンブール (TRT)</SelectItem>
                    <SelectItem value="Europe/Moscow">モスクワ (MSK)</SelectItem>
                    <SelectItem value="Europe/Kiev">キーウ (EET)</SelectItem>
                    <SelectItem value="Europe/Warsaw">ワルシャワ (CET)</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>アジア・太平洋</SelectLabel>
                    <SelectItem value="Asia/Dubai">ドバイ (GST)</SelectItem>
                    <SelectItem value="Asia/Kolkata">インド (IST)</SelectItem>
                    <SelectItem value="Asia/Bangkok">バンコク (ICT)</SelectItem>
                    <SelectItem value="Asia/Singapore">シンガポール (SGT)</SelectItem>
                    <SelectItem value="Asia/Hong_Kong">香港 (HKT)</SelectItem>
                    <SelectItem value="Asia/Shanghai">上海 (CST)</SelectItem>
                    <SelectItem value="Asia/Tokyo">東京 (JST)</SelectItem>
                    <SelectItem value="Asia/Seoul">ソウル (KST)</SelectItem>
                    <SelectItem value="Asia/Taipei">台北 (CST)</SelectItem>
                    <SelectItem value="Asia/Jakarta">ジャカルタ (WIB)</SelectItem>
                    <SelectItem value="Australia/Sydney">シドニー (AEST)</SelectItem>
                    <SelectItem value="Australia/Melbourne">メルボルン (AEST)</SelectItem>
                    <SelectItem value="Australia/Perth">パース (AWST)</SelectItem>
                    <SelectItem value="Pacific/Auckland">オークランド (NZST)</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>アフリカ・中東</SelectLabel>
                    <SelectItem value="Africa/Cairo">カイロ (EET)</SelectItem>
                    <SelectItem value="Africa/Lagos">ラゴス (WAT)</SelectItem>
                    <SelectItem value="Africa/Johannesburg">ヨハネスブルグ (SAST)</SelectItem>
                    <SelectItem value="Africa/Nairobi">ナイロビ (EAT)</SelectItem>
                    <SelectItem value="Asia/Riyadh">リヤド (AST)</SelectItem>
                    <SelectItem value="Asia/Tehran">テヘラン (IRST)</SelectItem>
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>その他</SelectLabel>
                    <SelectItem value="UTC">UTC</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  保存中...
                </>
              ) : (
                '設定を保存'
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
