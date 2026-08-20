'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Globe, Lock, UserPlus, FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Visibility = 'PRIVATE' | 'INVITE' | 'PUBLIC';

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
    label: '招待のみ',
    description: 'メールで特定の相手にのみ共有します',
    icon: <UserPlus className="h-5 w-5" />,
  },
  {
    value: 'PUBLIC',
    label: '公開',
    description: 'リンクを知っている人は誰でも閲覧できます',
    icon: <Globe className="h-5 w-5" />,
  },
];

export default function NewWorkspaceProjectPageClient({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    visibility: 'PRIVATE' as Visibility,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, workspaceId }),
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
            href={`/workspaces/${workspaceId}`}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            ワークスペースに戻る
          </Link>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FolderPlus className="h-7 w-7 text-primary" />
            </div>
            <CardTitle className="text-2xl">ワークスペースにプロジェクトを作成</CardTitle>
            <CardDescription className="text-base">
              このプロジェクトはすべてのワークスペースメンバーがアクセスできます
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">
                  プロジェクト名
                </Label>
                <Input
                  id="name"
                  placeholder="例: 製品ローンチ動画"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">
                  説明 <span className="text-muted-foreground font-normal">（任意）</span>
                </Label>
                <Textarea
                  id="description"
                  placeholder="このプロジェクトの内容は？"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">公開範囲</Label>
                <div className="grid gap-2">
                  {visibilityOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                        formData.visibility === option.value
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="visibility"
                        value={option.value}
                        checked={formData.visibility === option.value}
                        onChange={(e) =>
                          setFormData({ ...formData, visibility: e.target.value as Visibility })
                        }
                        className="sr-only"
                      />
                      <div className="mt-0.5 text-muted-foreground">{option.icon}</div>
                      <div>
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="text-xs text-muted-foreground">{option.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
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
                  'プロジェクトを作成'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
