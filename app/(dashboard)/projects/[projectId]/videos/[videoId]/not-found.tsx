import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Film } from 'lucide-react';

export default function VideoNotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <Film className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">動画が見つかりません</h1>
        <p className="text-muted-foreground max-w-md">
          お探しの動画は存在しないか、削除されました。
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link href="/dashboard">ダッシュボードへ</Link>
        </Button>
      </div>
    </div>
  );
}
