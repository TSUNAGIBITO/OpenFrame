'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Video, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8 || password.length > 128) {
      setError('パスワードは 8〜128 文字で入力してください');
      return;
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        router.push('/login?passwordReset=true');
      } else {
        setError(data?.error ?? 'エラーが発生しました。もう一度お試しください。');
      }
    } catch {
      setError('エラーが発生しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Video className="h-8 w-8 text-primary" />
          <span className="font-bold text-2xl">つなぐレビュー</span>
        </Link>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <KeyRound className="h-5 w-5" />
              新しいパスワードを設定
            </CardTitle>
            <CardDescription>アカウントの新しいパスワードを入力してください</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!token && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                リンクが無効です。パスワード再設定をもう一度リクエストしてください。
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="password">新しいパスワード</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError('');
                  }}
                  required
                  disabled={loading || !token}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">新しいパスワード(確認)</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError('');
                  }}
                  required
                  disabled={loading || !token}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || !token}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                パスワードを再設定
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">
                サインインに戻る
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
