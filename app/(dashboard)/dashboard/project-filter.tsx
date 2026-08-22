'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  FolderOpen,
  Clock,
  Users,
  Globe,
  Lock,
  UserPlus,
  Building2,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  List,
  Film,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { resolvePublicBunnyCdnHostname } from '@/lib/bunny-cdn';

interface SerializedProject {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  updatedAt: string;
  workspaceId: string | null;
  workspaceName: string | null;
  memberCount: number;
  videoCount: number;
  thumbnailUrl: string | null;
}

interface ProjectFilterProps {
  projects: SerializedProject[];
  workspaces: { id: string; name: string }[];
  totalPages: number;
  canCreateProjects: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
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

function VisibilityIcon({ visibility }: { visibility: string }) {
  switch (visibility) {
    case 'PUBLIC':
      return <Globe className="h-3.5 w-3.5" />;
    case 'INVITE':
      return <UserPlus className="h-3.5 w-3.5" />;
    default:
      return <Lock className="h-3.5 w-3.5" />;
  }
}

function visibilityLabel(visibility: string): string {
  switch (visibility) {
    case 'PUBLIC':
      return '公開';
    case 'INVITE':
      return '招待制';
    default:
      return '非公開';
  }
}

type SortOrder = 'desc' | 'asc';
type ViewMode = 'card' | 'list';

const VIEW_MODE_STORAGE_KEY = 'tsunagu-review-project-view';

/** Bunny のサムネイルURLを公開CDNホスト名に付け替える(video-card.tsx と同じ扱い) */
function useResolvedThumbnail(rawUrl: string | null): string {
  const bunnyCdnHostname = useMemo(() => resolvePublicBunnyCdnHostname(), []);
  return useMemo(() => {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname === 'vz-thumbnail.b-cdn.net' && bunnyCdnHostname) {
        parsed.hostname = bunnyCdnHostname;
      }
      return parsed.toString();
    } catch {
      return rawUrl;
    }
  }, [rawUrl, bunnyCdnHostname]);
}

function ProjectThumbnail({
  project,
  className,
}: {
  project: SerializedProject;
  className: string;
}) {
  const [imgError, setImgError] = useState(false);
  const resolvedUrl = useResolvedThumbnail(project.thumbnailUrl);

  if (!resolvedUrl || imgError) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-gradient-to-br from-primary/15 via-secondary to-secondary`}
      >
        <Film className="h-1/3 w-1/3 max-h-10 max-w-10 text-primary/40" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedUrl}
      alt={`${project.name} のサムネイル`}
      className={`${className} object-cover`}
      loading="lazy"
      onError={() => setImgError(true)}
    />
  );
}

export function ProjectFilter({
  projects,
  workspaces,
  totalPages,
  canCreateProjects,
}: ProjectFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedWorkspace = searchParams.get('ws') || 'all';
  const sortOrder = (searchParams.get('sort') as SortOrder) || 'desc';
  const page = Number(searchParams.get('page')) || 1;

  // カード/リストの表示切替(端末ごとに記憶する)
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  useEffect(() => {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (stored === 'list' || stored === 'card') setViewMode(stored);
  }, []);
  const changeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  }, []);

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === 'all' && name === 'ws') {
        params.delete(name);
      } else {
        params.set(name, value);
      }

      // Reset page when filter or sort changes
      if (name !== 'page') {
        params.set('page', '1');
      }

      return params.toString();
    },
    [searchParams]
  );

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight">プロジェクト</h1>
          {workspaces.length > 0 && (
            <Select
              value={selectedWorkspace}
              onValueChange={(val) => {
                router.push(`${pathname}?${createQueryString('ws', val)}`);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="すべてのワークスペース" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">すべてのワークスペース</SelectItem>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              aria-label="カード表示"
              onClick={() => changeViewMode('card')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              aria-label="リスト表示"
              onClick={() => changeViewMode('list')}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const newOrder = sortOrder === 'desc' ? 'asc' : 'desc';
              router.push(`${pathname}?${createQueryString('sort', newOrder)}`);
            }}
            className="flex items-center gap-2"
          >
            {sortOrder === 'desc' ? (
              <>
                <ArrowDown className="h-4 w-4" />
                新しい順
              </>
            ) : (
              <>
                <ArrowUp className="h-4 w-4" />
                古い順
              </>
            )}
          </Button>
          {canCreateProjects && (
            <Button asChild>
              <Link href="/projects/new">
                <Plus className="h-4 w-4 mr-2" />
                新規プロジェクト
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Projects */}
      {projects.length > 0 ? (
        viewMode === 'card' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="h-full overflow-hidden pt-0 transition-colors hover:bg-accent/50 cursor-pointer">
                  <ProjectThumbnail project={project} className="aspect-video w-full" />
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <FolderOpen className="h-5 w-5 text-primary" />
                        {project.name}
                      </CardTitle>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <VisibilityIcon visibility={project.visibility} />
                        {visibilityLabel(project.visibility)}
                      </Badge>
                    </div>
                    {project.workspaceName && (
                      <div className="mt-1">
                        <Badge
                          variant="secondary"
                          className="text-xs flex items-center gap-1 w-fit"
                        >
                          <Building2 className="h-3 w-3" />
                          {project.workspaceName}
                        </Badge>
                      </div>
                    )}
                    <CardDescription className="line-clamp-2">
                      {project.description || '説明なし'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatRelativeTime(project.updatedAt)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {project.memberCount}
                      </span>
                      <span>動画 {project.videoCount} 件</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border bg-card">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <ProjectThumbnail
                  project={project}
                  className="h-14 w-24 shrink-0 rounded-sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{project.name}</span>
                    {project.workspaceName && (
                      <Badge
                        variant="secondary"
                        className="hidden sm:flex items-center gap-1 text-xs shrink-0"
                      >
                        <Building2 className="h-3 w-3" />
                        {project.workspaceName}
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {project.description || '説明なし'}
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {formatRelativeTime(project.updatedAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {project.memberCount}
                  </span>
                  <span>動画 {project.videoCount} 件</span>
                </div>
                <Badge
                  variant="outline"
                  className="hidden sm:flex items-center gap-1 shrink-0"
                >
                  <VisibilityIcon visibility={project.visibility} />
                  {visibilityLabel(project.visibility)}
                </Badge>
              </Link>
            ))}
          </div>
        )
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {selectedWorkspace === 'all'
                ? 'プロジェクトはまだありません'
                : 'このワークスペースにはプロジェクトがありません'}
            </h3>
            <p className="text-muted-foreground text-center mb-4">
              {selectedWorkspace === 'all'
                ? '最初のプロジェクトを作成して、動画フィードバックの収集を始めましょう'
                : 'このワークスペースにプロジェクトを作成して始めましょう'}
            </p>
            {canCreateProjects && (
              <Button asChild>
                <Link href="/projects/new">
                  <Plus className="h-4 w-4 mr-2" />
                  プロジェクトを作成
                </Link>
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
            disabled={page <= 1}
            onClick={() => {
              if (page > 1) {
                router.push(`${pathname}?${createQueryString('page', (page - 1).toString())}`);
                router.refresh();
              }
            }}
          >
            前へ
          </Button>
          <span className="text-sm font-medium">
            {totalPages} ページ中 {page} ページ
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => {
              if (page < totalPages) {
                router.push(`${pathname}?${createQueryString('page', (page + 1).toString())}`);
                router.refresh();
              }
            }}
          >
            次へ
          </Button>
        </div>
      )}
    </>
  );
}
