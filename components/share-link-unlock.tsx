'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ShareLinkUnlockProps {
  videoId: string;
}

export function ShareLinkUnlock({ videoId }: ShareLinkUnlockProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitPassword = async () => {
    if (!password.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/watch/${videoId}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || 'パスワードが正しくありません');
        return;
      }

      router.replace(`/watch/${videoId}`);
      router.refresh();
    } catch {
      setError('パスワードを確認できませんでした');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="text-center mb-5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">パスワードが必要です</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共有された動画を見るにはパスワードを入力してください。
          </p>
        </div>

        <div className="space-y-3">
          <label htmlFor="share-link-password" className="sr-only">
            パスワード
          </label>
          <Input
            id="share-link-password"
            type="password"
            placeholder="パスワード"
            value={password}
            maxLength={128}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submitPassword();
              }
            }}
            autoFocus
          />

          <Button className="w-full" disabled={isSubmitting} onClick={() => void submitPassword()}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="sr-only">解除中</span>
              </>
            ) : (
              '続ける'
            )}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-4">
          または、アカウントで{' '}
          <Link href="/login" className="underline hover:text-foreground">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
