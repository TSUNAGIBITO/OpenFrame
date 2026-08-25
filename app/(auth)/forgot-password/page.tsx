'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { Video, Mail, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function ForgotPasswordContent() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setSent(true);
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
              <Mail className="h-5 w-5" />
              パスワードをお忘れですか？
            </CardTitle>
            <CardDescription>
              登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sent ? (
              <div className="p-3 rounded-md bg-green-500/10 text-green-600 text-sm text-center">
                そのメールアドレスのアカウントが存在する場合、パスワード再設定メールを送信しました。受信トレイ(と迷惑メールフォルダ)をご確認ください。
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">メールアドレス</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError('');
                    }}
                    required
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  再設定メールを送信
                </Button>
              </form>
            )}

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

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordContent />
    </Suspense>
  );
}
