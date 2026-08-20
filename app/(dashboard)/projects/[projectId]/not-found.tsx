import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FolderX } from 'lucide-react';

export default function ProjectNotFound() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <FolderX className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">プロジェクトが見つかりません</h1>
        <p className="text-muted-foreground max-w-md">
          お探しのプロジェクトは存在しないか、アクセス権がありません。
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="default">
          <Link href="/dashboard">すべてのプロジェクトを見る</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/projects/new">新規プロジェクトを作成</Link>
        </Button>
      </div>
    </div>
  );
}
