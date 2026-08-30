'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  Copy,
  Link2,
  Loader2,
  RefreshCcw,
  ShieldOff,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface VideoSharePageProps {
  projectId: string;
  videoId: string;
}

interface ShareLinkData {
  id: string;
  token: string;
  allowGuests: boolean;
  allowDownloads: boolean;
  hasPassword: boolean;
  expiresAt: string | null;
}

type ExpiryOption = 'none' | '24h' | '7d' | '30d' | 'custom';

function formatExpiryLabel(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

// datetime-local 入力用にローカル時刻の "YYYY-MM-DDTHH:mm" へ変換する
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

interface ShareResponse {
  data: {
    link: ShareLinkData | null;
    shareUrl: string | null;
  };
  error?: string;
}

export default function VideoSharePageClient({ projectId, videoId }: VideoSharePageProps) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>('none');
  const [customExpiry, setCustomExpiry] = useState('');

  useEffect(() => {
    if (!projectId || !videoId) return;

    async function loadShareLink() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`/api/projects/${projectId}/videos/${videoId}/share`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as ShareResponse;

        if (!response.ok || payload.error) {
          setError(payload.error || '共有リンクの読み込みに失敗しました');
          setShareUrl(null);
          return;
        }

        setShareUrl(payload.data.shareUrl);
        setHasPassword(!!payload.data.link?.hasPassword);
        setAllowDownloads(!!payload.data.link?.allowDownloads);
        const loadedExpiresAt = payload.data.link?.expiresAt ?? null;
        setExpiresAt(loadedExpiresAt);
        if (loadedExpiresAt) {
          setExpiryOption('custom');
          setCustomExpiry(toDatetimeLocalValue(loadedExpiresAt));
        }
      } catch {
        setError('共有リンクの読み込みに失敗しました');
        setShareUrl(null);
        setHasPassword(false);
        setAllowDownloads(false);
        setExpiresAt(null);
      } finally {
        setLoading(false);
      }
    }

    loadShareLink();
  }, [projectId, videoId]);

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const createShareLink = async () => {
    if (!projectId || !videoId) return;

    setSubmitting(true);
    setError('');

    // 再生成時は期限切れでない既存の有効期限を引き継ぐ
    const activeExpiresAt =
      expiresAt && new Date(expiresAt).getTime() > Date.now() ? expiresAt : null;

    try {
      const response = await fetch(`/api/projects/${projectId}/videos/${videoId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowGuests: true, allowDownloads, expiresAt: activeExpiresAt }),
      });

      const payload = (await response.json()) as ShareResponse;
      if (!response.ok || payload.error) {
        setError(payload.error || '共有リンクの作成に失敗しました');
        return;
      }

      setShareUrl(payload.data.shareUrl);
      setHasPassword(!!payload.data.link?.hasPassword);
      setAllowDownloads(!!payload.data.link?.allowDownloads);
      setExpiresAt(payload.data.link?.expiresAt ?? null);
      setPassword('');
    } catch {
      setError('共有リンクの作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const revokeShareLink = async () => {
    if (!projectId || !videoId) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/projects/${projectId}/videos/${videoId}/share`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || '共有リンクの無効化に失敗しました');
        return;
      }

      setShareUrl(null);
      setHasPassword(false);
      setAllowDownloads(false);
      setExpiresAt(null);
      setExpiryOption('none');
      setCustomExpiry('');
      setPassword('');
    } catch {
      setError('共有リンクの無効化に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const updateSecuritySettings = async (clearPassword = false) => {
    if (!projectId || !videoId || !shareUrl) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/projects/${projectId}/videos/${videoId}/share`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(clearPassword ? { clearPassword: true } : {}),
          ...(!clearPassword ? { password } : {}),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | ShareResponse
        | { error?: string }
        | null;
      if (!response.ok || ('error' in (payload || {}) && payload?.error)) {
        setError((payload as { error?: string } | null)?.error || 'リンクのセキュリティ設定の更新に失敗しました');
        return;
      }

      const data = (payload as ShareResponse).data;
      setShareUrl(data.shareUrl);
      setHasPassword(!!data.link?.hasPassword);
      setAllowDownloads(!!data.link?.allowDownloads);
      setExpiresAt(data.link?.expiresAt ?? null);
      setPassword('');
    } catch {
      setError('リンクのセキュリティ設定の更新に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const updateDownloadSetting = async (nextAllowDownloads: boolean) => {
    if (!projectId || !videoId || !shareUrl) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/projects/${projectId}/videos/${videoId}/share`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowDownloads: nextAllowDownloads }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ShareResponse
        | { error?: string }
        | null;
      if (!response.ok || ('error' in (payload || {}) && payload?.error)) {
        setError(
          (payload as { error?: string } | null)?.error || 'ダウンロード設定の更新に失敗しました'
        );
        return;
      }
      const data = (payload as ShareResponse).data;
      setShareUrl(data.shareUrl);
      setAllowDownloads(!!data.link?.allowDownloads);
      setHasPassword(!!data.link?.hasPassword);
      setExpiresAt(data.link?.expiresAt ?? null);
    } catch {
      setError('ダウンロード設定の更新に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const updateExpirySetting = async () => {
    if (!projectId || !videoId || !shareUrl) return;

    let nextExpiresAt: string | null = null;
    if (expiryOption === '24h') {
      nextExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === '7d') {
      nextExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === '30d') {
      nextExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expiryOption === 'custom') {
      if (!customExpiry) {
        setError('カスタム日時を入力してください');
        return;
      }
      const parsed = new Date(customExpiry);
      if (Number.isNaN(parsed.getTime())) {
        setError('カスタム日時の形式が正しくありません');
        return;
      }
      if (parsed.getTime() <= Date.now()) {
        setError('有効期限には未来の日時を指定してください');
        return;
      }
      nextExpiresAt = parsed.toISOString();
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/api/projects/${projectId}/videos/${videoId}/share`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresAt: nextExpiresAt }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ShareResponse
        | { error?: string }
        | null;
      if (!response.ok || ('error' in (payload || {}) && payload?.error)) {
        setError((payload as { error?: string } | null)?.error || '有効期限の更新に失敗しました');
        return;
      }
      const data = (payload as ShareResponse).data;
      setShareUrl(data.shareUrl);
      setHasPassword(!!data.link?.hasPassword);
      setAllowDownloads(!!data.link?.allowDownloads);
      setExpiresAt(data.link?.expiresAt ?? null);
    } catch {
      setError('有効期限の更新に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const isExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-xl space-y-6">
        <Link
          href={`/projects/${projectId}/videos/${videoId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          動画に戻る
        </Link>

        <Card className="border-border/50 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">レビュー用に動画を共有</CardTitle>
            <CardDescription>
              レビュアーがこの動画を視聴してコメントできるよう、非公開リンクを作成します。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                リンク設定を読み込み中...
              </div>
            ) : shareUrl ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input value={shareUrl} readOnly className="font-mono text-sm h-11 bg-muted/50" />
                  <Button
                    variant={copied ? 'default' : 'outline'}
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={copyLink}
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button onClick={createShareLink} disabled={submitting} variant="outline">
                    {submitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-4 w-4 mr-2" />
                    )}
                    リンクを再生成
                  </Button>
                  <Button onClick={revokeShareLink} disabled={submitting} variant="destructive">
                    {submitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldOff className="h-4 w-4 mr-2" />
                    )}
                    リンクを無効化
                  </Button>
                </div>
                <div className="rounded-lg border p-3 space-y-2">
                  <div>
                    <p className="text-sm font-medium">動画のダウンロード</p>
                    <p className="text-xs text-muted-foreground">
                      このリンクの閲覧者にダウンロードを許可します
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={allowDownloads ? 'default' : 'outline'}
                      disabled={submitting || allowDownloads}
                      onClick={() => updateDownloadSetting(true)}
                    >
                      ダウンロードを許可
                    </Button>
                    <Button
                      variant={!allowDownloads ? 'default' : 'outline'}
                      disabled={submitting || !allowDownloads}
                      onClick={() => updateDownloadSetting(false)}
                    >
                      ダウンロードを禁止
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {hasPassword ? (
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    リンクのパスワード
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder={
                        hasPassword ? '現在のパスワードを置き換える新しいパスワードを入力' : 'パスワードを設定'
                      }
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                    />
                    <Button
                      onClick={() => updateSecuritySettings(false)}
                      disabled={submitting || !password.trim()}
                      variant="outline"
                    >
                      保存
                    </Button>
                    {hasPassword && (
                      <Button
                        onClick={() => updateSecuritySettings(true)}
                        disabled={submitting}
                        variant="outline"
                      >
                        削除
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarClock className={isExpired ? 'h-4 w-4 text-destructive' : 'h-4 w-4'} />
                    リンクの有効期限
                  </div>
                  <p
                    className={
                      isExpired ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'
                    }
                  >
                    {expiresAt
                      ? isExpired
                        ? `有効期限が切れています（${formatExpiryLabel(expiresAt)} まで）。新しい期限を設定するか、無期限に変更してください`
                        : `有効期限: ${formatExpiryLabel(expiresAt)} まで`
                      : '無期限'}
                  </p>
                  <div className="flex gap-2">
                    <Select
                      value={expiryOption}
                      onValueChange={(value) => setExpiryOption(value as ExpiryOption)}
                      disabled={submitting}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="有効期限を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">無期限</SelectItem>
                        <SelectItem value="24h">24時間</SelectItem>
                        <SelectItem value="7d">7日</SelectItem>
                        <SelectItem value="30d">30日</SelectItem>
                        <SelectItem value="custom">カスタム日時</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={updateExpirySetting} disabled={submitting} variant="outline">
                      保存
                    </Button>
                  </div>
                  {expiryOption === 'custom' && (
                    <Input
                      type="datetime-local"
                      value={customExpiry}
                      onChange={(e) => setCustomExpiry(e.target.value)}
                      disabled={submitting}
                    />
                  )}
                </div>
              </div>
            ) : (
              <Button onClick={createShareLink} disabled={submitting}>
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 mr-2" />
                )}
                レビューリンクを作成
              </Button>
            )}

            <p className="text-xs text-muted-foreground">
              このリンクを使うと、ゲストはアカウントなしでコメントを残せます。必要に応じてパスワードで保護できます。
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
