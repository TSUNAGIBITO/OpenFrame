'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PresentUnlockProps {
  token: string;
}

// プレゼンテーションリンクのパスワードゲート。
// /present/[token]/session にパスワードを送信し、成功したらページを再取得する。
export function PresentUnlock({ token }: PresentUnlockProps) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitPassword = async () => {
    if (!password.trim()) return;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`/present/${encodeURIComponent(token)}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error || 'パスワードが正しくありません');
        return;
      }

      router.refresh();
    } catch {
      setError('パスワードを確認できませんでした');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-lg">
        <div className="text-center mb-5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 mb-3">
            <Lock className="h-6 w-6 text-zinc-300" />
          </div>
          <h1 className="text-xl font-semibold text-zinc-100">パスワードが必要です</h1>
          <p className="text-sm text-zinc-400 mt-1">
            このプレゼンテーションを見るにはパスワードを入力してください。
          </p>
        </div>

        <div className="space-y-3">
          <label htmlFor="present-password" className="sr-only">
            パスワード
          </label>
          <Input
            id="present-password"
            type="password"
            placeholder="パスワード"
            value={password}
            maxLength={128}
            className="bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void submitPassword();
              }
            }}
            autoFocus
          />

          <Button
            className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-300"
            disabled={isSubmitting}
            onClick={() => void submitPassword()}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span className="sr-only">解除中</span>
              </>
            ) : (
              '続ける'
            )}
          </Button>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
