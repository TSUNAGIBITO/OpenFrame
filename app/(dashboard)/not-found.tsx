import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FileQuestion } from 'lucide-react';

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <FileQuestion className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">ページが見つかりません</h1>
        <p className="text-muted-foreground max-w-md">
          お探しのページは存在しないか、移動された可能性があります。
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="default">
          <Link href="/dashboard">ダッシュボードへ</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">ホームへ</Link>
        </Button>
      </div>
    </div>
  );
}
