'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Globe, Lock, UserPlus, FolderPlus, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

type Visibility = 'PRIVATE' | 'INVITE' | 'PUBLIC';

interface Workspace {
  id: string;
  name: string;
}

const visibilityOptions: {
  value: Visibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'PRIVATE',
    label: '非公開',
    description: 'ワークスペースメンバーとプロジェクトメンバーのみアクセスできます',
    icon: <Lock className="h-5 w-5" />,
  },
  {
    value: 'INVITE',
    label: '招待制',
    description: 'メールで特定の人に共有します',
    icon: <UserPlus className="h-5 w-5" />,
  },
  {
    value: 'PUBLIC',
    label: '公開',
    description: 'リンクを知っている人は誰でも閲覧できます',
    icon: <Globe className="h-5 w-5" />,
  },
];

export default function NewProjectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedWorkspace = searchParams.get('workspace');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoadingWorkspaces, setIsLoadingWorkspaces] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    visibility: 'PRIVATE' as Visibility,
    workspaceId: preselectedWorkspace || '',
  });

  useEffect(() => {
    async function fetchWorkspaces() {
      try {
        const res = await fetch('/api/workspaces');
        if (res.ok) {
          const data = await res.json();
          const workspacesData = data.data.workspaces || [];
          setWorkspaces(workspacesData);
          // Auto-select if only one workspace and none preselected
          if (!preselectedWorkspace && workspacesData.length === 1) {
            setFormData((prev) => ({ ...prev, workspaceId: workspacesData[0].id }));
          }
        }
      } catch {
        // ignore
      } finally {
        setIsLoadingWorkspaces(false);
      }
    }
    fetchWorkspaces();
  }, [preselectedWorkspace]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.workspaceId) {
      setError('ワークスペースを選択してください');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'プロジェクトの作成に失敗しました');
        return;
      }

      router.push(`/projects/${data.data.id}`);
    } catch {
      setError('問題が発生しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-xl">
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            プロジェクト一覧に戻る
          </Link>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FolderPlus className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">新規プロジェクトを作成</CardTitle>
            <CardDescription className="text-base">
              動画を整理してフィードバックを集めるための新しいプロジェクトを作成します
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Workspace selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">ワークスペース</Label>
                {isLoadingWorkspaces ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ワークスペースを読み込み中...
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center">
                    <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">
                      まずワークスペースが必要です。すべてのプロジェクトはワークスペースに属します。
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/workspaces/new">ワークスペースを作成</Link>
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={formData.workspaceId}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, workspaceId: v }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue placeholder="ワークスペースを選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {workspaces.map((ws) => (
                        <SelectItem key={ws.id} value={ws.id}>
                          <span className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            {ws.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  プロジェクト名
                </Label>
                <Input
                  id="name"
                  placeholder="例: 商品デモ 第1四半期"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  required
                  disabled={isLoading}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">
                  説明
                  <span className="text-muted-foreground font-normal ml-1">（任意）</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="このプロジェクトの概要を簡単に入力..."
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={3}
                  disabled={isLoading}
                  className="resize-none"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">アクセスできる人</Label>
                <div className="grid gap-3">
                  {visibilityOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, visibility: option.value }))}
                      disabled={isLoading}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                        formData.visibility === option.value
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                          : 'border-border hover:border-border/80 hover:bg-accent/50'
                      }`}
                    >
                      <div
                        className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                          formData.visibility === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {option.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{option.label}</div>
                        <div className="text-sm text-muted-foreground">{option.description}</div>
                      </div>
                      <div
                        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          formData.visibility === option.value
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground/30'
                        }`}
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
                <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={isLoading || !formData.name.trim() || !formData.workspaceId}
                  className="flex-1 h-11"
                >
                  {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  プロジェクトを作成
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="h-11 px-6"
                >
                  キャンセル
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
