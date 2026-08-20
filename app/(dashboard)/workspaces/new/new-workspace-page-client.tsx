'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Building2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function NewWorkspacePage({
  workspaceCreation,
}: {
  workspaceCreation: {
    canCreateWorkspace: boolean;
    reason: string | null;
  };
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'ワークスペースの作成に失敗しました');
        return;
      }

      router.push(`/workspaces/${data.data.id}`);
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
            href="/workspaces"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            ワークスペース一覧に戻る
          </Link>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              {workspaceCreation.canCreateWorkspace ? (
                <Building2 className="h-7 w-7 text-primary" />
              ) : (
                <Lock className="h-7 w-7 text-primary" />
              )}
            </div>
            <CardTitle className="text-2xl">
              {workspaceCreation.canCreateWorkspace ? '新規ワークスペースを作成' : 'アップグレードが必要です'}
            </CardTitle>
            <CardDescription className="text-base">
              {workspaceCreation.canCreateWorkspace
                ? 'ワークスペースを設定してプロジェクトを整理し、チームを招待しましょう'
                : workspaceCreation.reason || 'ワークスペースをもう1つ作成するにはアカウントをアップグレードしてください。'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {workspaceCreation.canCreateWorkspace ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">
                    ワークスペース名
                  </Label>
                  <Input
                    id="name"
                    placeholder="例: My Studio"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description" className="text-sm font-medium">
                    説明{' '}
                    <span className="text-muted-foreground font-normal">（任意）</span>
                  </Label>
                  <Textarea
                    id="description"
                    placeholder="このワークスペースの用途は？"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    disabled={isLoading}
                  />
                </div>

                {error && (
                  <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      作成中...
                    </>
                  ) : (
                    'ワークスペースを作成'
                  )}
                </Button>
              </form>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  すでにメンバーになっているワークスペース内であれば、引き続きプロジェクトの作成・管理ができます。
                </p>
                <Button asChild className="w-full">
                  <Link href="/settings">請求設定を開く</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
