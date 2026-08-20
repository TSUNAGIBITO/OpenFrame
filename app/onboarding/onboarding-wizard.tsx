'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Video,
  Building2,
  FolderPlus,
  PlayCircle,
  Bell,
  ChevronRight,
  Loader2,
  Lock,
  UserPlus,
  Globe,
  Youtube,
  Upload,
  Mail,
  AlertCircle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type Visibility = 'PRIVATE' | 'INVITE' | 'PUBLIC';

const TOTAL_STEPS = 5;

const visibilityOptions: {
  value: Visibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'PRIVATE',
    label: '非公開',
    description: 'ワークスペースメンバーとプロジェクトメンバーのみアクセス可能',
    icon: <Lock className="h-5 w-5" />,
  },
  {
    value: 'INVITE',
    label: '招待のみ',
    description: 'メールで特定の人にだけ共有',
    icon: <UserPlus className="h-5 w-5" />,
  },
  {
    value: 'PUBLIC',
    label: '公開',
    description: 'リンクを知っている人は誰でも閲覧可能',
    icon: <Globe className="h-5 w-5" />,
  },
];

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
        'flex items-center justify-between w-full px-3 py-2 rounded-lg border transition-colors text-left',
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

// ─── Step 1: Welcome ───────────────────────────────────────────────────────────

// Asked here rather than on the registration form. The whole point of measuring
// this funnel is the signup conversion rate, and a question added to the form
// would move the number being measured.
const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'GITHUB', label: 'GitHub' },
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'GOOGLE', label: '検索エンジン' },
  { value: 'REVIEW_LINK', label: 'レビュー・比較サイト' },
  { value: 'REFERRAL', label: '知人からのおすすめ' },
  { value: 'COMMUNITY', label: 'Reddit・X・Discord・フォーラム' },
  { value: 'OUTBOUND', label: '当社からのメール' },
  { value: 'OTHER', label: 'その他' },
];

function StepWelcome({
  userName,
  askSource,
  onNext,
}: {
  userName: string;
  askSource: boolean;
  onNext: () => void;
}) {
  const [source, setSource] = useState<string>('');
  const [note, setNote] = useState('');

  const handleNext = () => {
    // Never blocks the wizard. An unanswered or failed question costs one row in
    // a cross-check column; a broken Get Started button costs the account.
    if (askSource && source) {
      void fetch('/api/onboarding/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, note: source === 'OTHER' ? note : undefined }),
      }).catch(() => undefined);
    }
    onNext();
  };

  return (
    <div className="text-center space-y-8">
      <div className="mx-auto w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
        <Video className="h-12 w-12 text-primary" />
      </div>
      <div className="space-y-3">
        <h2 className="text-3xl font-bold tracking-tight">
          {userName.split(' ')[0]}さん、つなぐレビューへようこそ！
        </h2>
        <p className="text-base text-muted-foreground max-w-md mx-auto">
          つなぐレビューは、みんなで動画をレビューできるプラットフォームです。タイムスタンプ付きのフィードバック収集、バージョン管理、承認フローを一か所でまとめて行えます。
        </p>
      </div>

      {askSource && (
        <div className="mx-auto max-w-sm space-y-3 text-left">
          <Label htmlFor="acquisition-source" className="text-sm text-muted-foreground">
            どこで知りましたか？（任意）
          </Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger id="acquisition-source" className="w-full">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {source === 'OTHER' && (
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="差し支えなければ、どこで知ったか教えてください"
            />
          )}
        </div>
      )}

      <Button onClick={handleNext} size="lg" className="w-full sm:w-auto px-10 h-12 text-base">
        始める
        <ChevronRight className="h-5 w-5 ml-1" />
      </Button>
    </div>
  );
}

// ─── Step 2: Create Workspace ──────────────────────────────────────────────────

function StepWorkspace({
  canCreateWorkspace,
  availableWorkspaces,
  selectedWorkspaceId,
  onWorkspaceSelected,
  onNext,
  onWorkspaceCreated,
}: {
  canCreateWorkspace: boolean;
  availableWorkspaces: Array<{ id: string; name: string; isOwner: boolean }>;
  selectedWorkspaceId: string | null;
  onWorkspaceSelected: (workspaceId: string) => void;
  onNext: () => void;
  onWorkspaceCreated: (id: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', description: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ワークスペースの作成に失敗しました');
        return;
      }
      onWorkspaceCreated(data.data.id);
      onNext();
    } catch {
      setError('問題が発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  if (!canCreateWorkspace) {
    return (
      <div className="space-y-7">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ワークスペースへのアクセス</h2>
          <p className="text-base text-muted-foreground">
            現在、お使いのアカウントでは新しいワークスペースを作成できません。
          </p>
        </div>

        {availableWorkspaces.length > 0 ? (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                すでに管理者権限を持っているワークスペース内であれば、プロジェクトを作成できます。
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="onboarding-workspace">ワークスペースを選択</Label>
              <Select value={selectedWorkspaceId ?? undefined} onValueChange={onWorkspaceSelected}>
                <SelectTrigger id="onboarding-workspace" className="w-full">
                  <SelectValue placeholder="ワークスペースを選択" />
                </SelectTrigger>
                <SelectContent>
                  {availableWorkspaces.map((workspace) => (
                    <SelectItem key={workspace.id} value={workspace.id}>
                      {workspace.name}
                      {workspace.isOwner ? '（オーナー）' : '（管理者）'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={onNext} className="w-full h-11" disabled={!selectedWorkspaceId}>
              次へ
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                現在、プロジェクトを作成できるワークスペースがありません。ワークスペースのオーナーに管理者として招待してもらうか、後でアップグレードしてご自身のワークスペースを作成してください。
              </span>
            </div>
            <Button onClick={onNext} className="w-full h-11">
              次へ
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <Building2 className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">ワークスペースを作成</h2>
        <p className="text-base text-muted-foreground">
          ワークスペースでプロジェクトとチームメンバーを整理できます。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="ws-name" className="text-sm font-medium">
            ワークスペース名
          </Label>
          <Input
            id="ws-name"
            placeholder="例: My Studio"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
            disabled={isLoading}
            className="h-11"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ws-desc" className="text-sm font-medium">
            説明 <span className="text-muted-foreground font-normal">（任意）</span>
          </Label>
          <Textarea
            id="ws-desc"
            placeholder="このワークスペースの用途は？"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
            disabled={isLoading}
            className="resize-none"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Button
            type="submit"
            className="w-full h-11"
            disabled={isLoading || !formData.name.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                作成中...
              </>
            ) : (
              'ワークスペースを作成'
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onNext}
            disabled={isLoading}
            className="w-full text-muted-foreground"
          >
            このステップをスキップ
          </Button>
        </div>
      </form>
    </div>
  );
}

// ─── Step 3: Create Project ────────────────────────────────────────────────────

function StepProject({
  workspaceId,
  availableWorkspaces,
  canCreateWorkspace,
  onNext,
  onProjectCreated,
}: {
  workspaceId: string | null;
  availableWorkspaces: Array<{ id: string; name: string; isOwner: boolean }>;
  canCreateWorkspace: boolean;
  onNext: () => void;
  onProjectCreated: (id: string) => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    visibility: 'PRIVATE' as Visibility,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId) return;
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'プロジェクトの作成に失敗しました');
        return;
      }
      onProjectCreated(data.data.id);
      onNext();
    } catch {
      setError('問題が発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-7">
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <FolderPlus className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">最初のプロジェクトを作成</h2>
        <p className="text-base text-muted-foreground">
          プロジェクトには動画と集まったフィードバックがまとまります。
        </p>
      </div>

      {!workspaceId ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {canCreateWorkspace
                ? 'ワークスペースの作成をスキップしました。プロジェクトにはワークスペースが必要です。どちらも後からダッシュボードで作成できます。'
                : availableWorkspaces.length === 0
                  ? '現在、どのワークスペースでもプロジェクトを作成する権限がありません。'
                  : 'ここでプロジェクトを作成するには、前のステップでワークスペースを選択してください。'}
            </span>
          </div>
          <Button onClick={onNext} className="w-full h-11">
            次へ
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="proj-name" className="text-sm font-medium">
              プロジェクト名
            </Label>
            <Input
              id="proj-name"
              placeholder="例: 第1四半期プロダクトデモ"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={isLoading}
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc" className="text-sm font-medium">
              説明 <span className="text-muted-foreground font-normal">（任意）</span>
            </Label>
            <Textarea
              id="proj-desc"
              placeholder="このプロジェクトの概要を簡単に..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              disabled={isLoading}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">アクセスできる範囲</Label>
            <div className="grid gap-2.5">
              {visibilityOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, visibility: option.value })}
                  disabled={isLoading}
                  className={cn(
                    'w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all',
                    formData.visibility === option.value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border hover:border-border/80 hover:bg-accent/50'
                  )}
                >
                  <div
                    className={cn(
                      'shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
                      formData.visibility === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-muted-foreground">{option.description}</div>
                  </div>
                  <div
                    className={cn(
                      'shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center',
                      formData.visibility === option.value
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/30'
                    )}
                  >
                    {formData.visibility === option.value && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="submit"
              className="w-full h-11"
              disabled={isLoading || !formData.name.trim()}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  作成中...
                </>
              ) : (
                'プロジェクトを作成'
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onNext}
              disabled={isLoading}
              className="w-full text-muted-foreground"
            >
              このステップをスキップ
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Step 4: Add First Video (informational) ───────────────────────────────────

function StepVideo({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-7">
      <div className="text-center space-y-3">
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <PlayCircle className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">動画の追加</h2>
        <p className="text-base text-muted-foreground">
          つなぐレビューでは、プロジェクトに動画を追加する方法が2つあります。
        </p>
      </div>

      <div className="grid gap-4">
        <div className="rounded-xl border p-5 space-y-2">
          <div className="flex items-center gap-2.5 font-semibold">
            <Youtube className="h-5 w-5 text-red-500" />
            YouTube リンク
          </div>
          <p className="text-sm text-muted-foreground">
            YouTube 動画のリンクを貼り付けるだけ。つなぐレビューがタイトル・サムネイル・再生時間を自動で取り込みます。ファイルのアップロードは不要です。
          </p>
        </div>
        <div className="rounded-xl border p-5 space-y-2">
          <div className="flex items-center gap-2.5 font-semibold">
            <Upload className="h-5 w-5 text-primary" />
            直接アップロード
          </div>
          <p className="text-sm text-muted-foreground">
            お使いのデバイスから動画ファイルを直接アップロード。ファイルは処理され、CDN 経由で配信されるため、世界中どこでも高速かつ安定して再生できます。
          </p>
        </div>
      </div>

      <Button onClick={onNext} className="w-full h-11">
        了解、次へ
        <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

// ─── Step 5: Notification Preferences ─────────────────────────────────────────

function StepNotifications({ onFinish }: { onFinish: () => Promise<void> }) {
  const [isSaving, setIsSaving] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [events, setEvents] = useState({
    onNewVideo: true,
    onNewVersion: true,
    onNewComment: true,
    onNewReply: true,
    onApprovalEvents: true,
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailEnabled,
          telegramEnabled: false,
          telegramBotToken: null,
          telegramChatId: null,
          onNewVideo: events.onNewVideo,
          onNewVersion: events.onNewVersion,
          onNewComment: events.onNewComment,
          onNewReply: events.onNewReply,
          onApprovalEvents: events.onApprovalEvents,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        }),
      });
    } catch {
      // best-effort; don't block finishing
    }
    await onFinish();
  };

  return (
    <div className="space-y-5">
      <div className="text-center space-y-2">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-2">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">通知設定</h2>
        <p className="text-sm text-muted-foreground">
          通知を受け取るタイミングを選べます。メールと Telegram の両方に対応しています。Telegram はいつでも設定画面から設定できます。
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Mail className="h-4 w-4" />
            チャネル
          </div>
          <ToggleButton
            enabled={emailEnabled}
            onToggle={() => setEmailEnabled((v) => !v)}
            label="メール通知"
            description="アカウントのメールアドレスに通知を受け取る"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Bell className="h-4 w-4" />
            イベント
          </div>
          <ToggleButton
            enabled={events.onNewVideo}
            onToggle={() => setEvents((e) => ({ ...e, onNewVideo: !e.onNewVideo }))}
            label="動画の追加"
            description="自分のプロジェクトに新しい動画が追加されたとき"
          />
          <ToggleButton
            enabled={events.onNewVersion}
            onToggle={() => setEvents((e) => ({ ...e, onNewVersion: !e.onNewVersion }))}
            label="バージョンの追加"
            description="既存の動画に新しいバージョンが追加されたとき"
          />
          <ToggleButton
            enabled={events.onNewComment}
            onToggle={() => setEvents((e) => ({ ...e, onNewComment: !e.onNewComment }))}
            label="新しいコメント"
            description="自分の動画に誰かがコメントしたとき"
          />
          <ToggleButton
            enabled={events.onNewReply}
            onToggle={() => setEvents((e) => ({ ...e, onNewReply: !e.onNewReply }))}
            label="新しい返信"
            description="コメントスレッドに誰かが返信したとき"
          />
          <ToggleButton
            enabled={events.onApprovalEvents}
            onToggle={() => setEvents((e) => ({ ...e, onApprovalEvents: !e.onApprovalEvents }))}
            label="承認フロー"
            description="承認リクエストが作成・対応・確定されたとき"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={handleSave} className="w-full h-11" disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              保存中...
            </>
          ) : (
            '保存して完了'
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onFinish}
          disabled={isSaving}
          className="w-full text-muted-foreground"
        >
          スキップ
        </Button>
      </div>
    </div>
  );
}

// ─── Wizard Shell ──────────────────────────────────────────────────────────────

export function OnboardingWizard({
  userName,
  canCreateWorkspace,
  availableWorkspaces,
  askAcquisitionSource,
}: {
  userName: string;
  canCreateWorkspace: boolean;
  availableWorkspaces: Array<{ id: string; name: string; isOwner: boolean }>;
  askAcquisitionSource: boolean;
}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(
    availableWorkspaces[0]?.id ?? null
  );
  const [isCompleting, setIsCompleting] = useState(false);

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));

  const completeOnboarding = async () => {
    setIsCompleting(true);
    try {
      const res = await fetch('/api/onboarding/complete', { method: 'POST' });
      if (!res.ok) {
        toast.error('セットアップを完了できませんでした。もう一度お試しください。');
        setIsCompleting(false);
        return;
      }
    } catch {
      toast.error('問題が発生しました。もう一度お試しください。');
      setIsCompleting(false);
      return;
    }
    router.push('/dashboard');
  };

  return (
    <div className="w-full max-w-2xl">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        {/* Step dots */}
        <div className="flex items-center gap-2.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((step) => (
            <div
              key={step}
              className={cn(
                'rounded-full transition-all',
                step === currentStep
                  ? 'w-7 h-3 bg-primary'
                  : step < currentStep
                    ? 'w-3 h-3 bg-primary/40'
                    : 'w-3 h-3 bg-muted'
              )}
            />
          ))}
        </div>

        {/* Skip button */}
        {currentStep > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={completeOnboarding}
            disabled={isCompleting}
            className="text-muted-foreground text-sm"
          >
            {isCompleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
            セットアップをスキップ
          </Button>
        )}
      </div>

      {/* Step content */}
      <Card className="border-border/50 shadow-lg">
        <CardContent className="pt-10 pb-10 px-10">
          {currentStep === 1 && (
            <StepWelcome userName={userName} askSource={askAcquisitionSource} onNext={goNext} />
          )}
          {currentStep === 2 && (
            <StepWorkspace
              canCreateWorkspace={canCreateWorkspace}
              availableWorkspaces={availableWorkspaces}
              selectedWorkspaceId={createdWorkspaceId}
              onWorkspaceSelected={setCreatedWorkspaceId}
              onNext={goNext}
              onWorkspaceCreated={setCreatedWorkspaceId}
            />
          )}
          {currentStep === 3 && (
            <StepProject
              workspaceId={createdWorkspaceId}
              availableWorkspaces={availableWorkspaces}
              canCreateWorkspace={canCreateWorkspace}
              onNext={goNext}
              onProjectCreated={() => {}}
            />
          )}
          {currentStep === 4 && <StepVideo onNext={goNext} />}
          {currentStep === 5 && <StepNotifications onFinish={completeOnboarding} />}
        </CardContent>
      </Card>

      {/* Step label */}
      <p className="text-center text-sm text-muted-foreground mt-5">
        全{TOTAL_STEPS}ステップ中 {currentStep} ステップ目
      </p>
    </div>
  );
}
