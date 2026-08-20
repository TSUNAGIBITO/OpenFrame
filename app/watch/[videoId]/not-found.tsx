import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Film, XCircle } from 'lucide-react';

export default function WatchNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="relative">
          <Film className="h-12 w-12 text-muted-foreground" />
          <XCircle className="absolute -bottom-1 -right-1 h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">動画が見つかりません</h1>
        <p className="text-muted-foreground max-w-md">
          お探しの動画は存在しないか、削除されたか、リンクの有効期限が切れている可能性があります。
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="default">
          <Link href="/">ホームへ</Link>
        </Button>
      </div>
    </div>
  );
}
