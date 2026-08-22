'use client';

import Link from 'next/link';
import { Plus, Building2, Clock, FolderOpen, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'たった今';
  if (diffMins < 60) return `${diffMins}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  return date.toLocaleDateString();
}

interface SerializedWorkspace {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  _count: {
    projects: number;
    members: number;
  };
}

interface WorkspacesClientProps {
  workspaces: SerializedWorkspace[];
  totalPages: number;
  currentPage: number;
  workspaceCreation: {
    canCreateWorkspace: boolean;
    reason: string | null;
  };
}

export function WorkspacesClient({
  workspaces,
  totalPages,
  currentPage,
  workspaceCreation,
}: WorkspacesClientProps) {
  const router = useRouter();

  return (
    <div className="px-6 lg:px-8 py-8 w-full max-w-[1440px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ワークスペース</h1>
          <p className="text-muted-foreground mt-1">ワークスペースとそのプロジェクトを管理します</p>
          {!workspaceCreation.canCreateWorkspace && workspaceCreation.reason ? (
            <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
              {workspaceCreation.reason}
            </p>
          ) : null}
        </div>
        {workspaceCreation.canCreateWorkspace ? (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/workspaces/new">
              <Plus className="h-4 w-4 mr-2" />
              新規ワークスペース
            </Link>
          </Button>
        ) : (
          <Button asChild className="w-full sm:w-auto">
            <Link href="/settings">アップグレードして作成</Link>
          </Button>
        )}
      </div>

      {/* Workspaces Grid */}
      {workspaces.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((workspace) => (
            <Link key={workspace.id} href={`/workspaces/${workspace.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/50 cursor-pointer">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    {workspace.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {workspace.description || '説明なし'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatRelativeTime(new Date(workspace.updatedAt))}
                    </span>
                    <span className="flex items-center gap-1">
                      <FolderOpen className="h-3.5 w-3.5" />
                      {workspace._count.projects}件のプロジェクト
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {workspace._count.members + 1}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">ワークスペースがまだありません</h3>
            <p className="text-muted-foreground text-center mb-4">
              ワークスペースを作成してプロジェクトを整理し、メンバーを招待しましょう
            </p>
            {workspaceCreation.canCreateWorkspace ? (
              <Button asChild>
                <Link href="/workspaces/new">
                  <Plus className="h-4 w-4 mr-2" />
                  ワークスペースを作成
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/settings">アップグレードして作成</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => {
              if (currentPage > 1) {
                router.push(`/workspaces?page=${currentPage - 1}`);
                router.refresh();
              }
            }}
          >
            前へ
          </Button>
          <span className="text-sm font-medium">
            {totalPages}ページ中 {currentPage}ページ
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => {
              if (currentPage < totalPages) {
                router.push(`/workspaces?page=${currentPage + 1}`);
                router.refresh();
              }
            }}
          >
            次へ
          </Button>
        </div>
      )}
    </div>
  );
}
