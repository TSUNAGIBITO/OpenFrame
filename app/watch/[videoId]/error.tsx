'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Film } from 'lucide-react';

export default function WatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Watch page error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="relative">
          <Film className="h-12 w-12 text-muted-foreground" />
          <AlertTriangle className="absolute -bottom-1 -right-1 h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">動画を表示できません</h1>
        <p className="text-muted-foreground max-w-md">
          この動画を読み込めませんでした。削除されたか、リンクが正しくない可能性があります。
        </p>
        {error.digest && <p className="text-muted-foreground text-xs">エラーID: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} variant="default">
          再試行
        </Button>
        <Button onClick={() => (window.location.href = '/')} variant="outline">
          ホームへ
        </Button>
      </div>
    </div>
  );
}
