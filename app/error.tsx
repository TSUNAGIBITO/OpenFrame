'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h1 className="text-2xl font-bold">問題が発生しました</h1>
        <p className="text-muted-foreground max-w-md">
          予期しないエラーが発生しました。通知を受け取り、修正に取り組んでいます。
        </p>
        {error.digest && <p className="text-muted-foreground text-xs">エラーID: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="default">
          再試行
        </Button>
        <Button onClick={() => (window.location.href = '/')} variant="outline">
          ホームへ戻る
        </Button>
      </div>
    </div>
  );
}
