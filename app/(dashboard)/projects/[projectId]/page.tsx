import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { GuestGate } from '@/components/guest-gate';
import { auth, checkProjectAccess } from '@/lib/auth';
import { db } from '@/lib/db';
import { ProjectContentClient } from './project-content-client';
import { isDirectFileUploadEnabled, isS3VideoUploadsEnabled } from '@/lib/feature-flags';
import { canDownloadProjectMedia } from '@/lib/project-download';

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0:00';
  const totalSeconds = Math.floor(seconds);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const session = await auth();
  const { projectId } = await params;
  const resolvedSearchParams = await searchParams;

  const page = Number(resolvedSearchParams?.page) || 1;
  const sortOrder = resolvedSearchParams?.sort === 'asc' ? 'asc' : 'desc';
  const pageSize = 21;
  const skip = (page - 1) * pageSize;

  // Fetch project with videos
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      workspace: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      members: {
        where: { userId: session?.user?.id || '' },
        select: { role: true },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const access = await checkProjectAccess(project, session?.user?.id);

  // Check access
  const isOwner = session?.user?.id === project.ownerId;
  const isMember = project.members.length > 0;
  const isPublic = project.visibility === 'PUBLIC';

  // Check workspace membership
  let isWorkspaceMember = false;
  let workspaceRole: string | null = null;
  if (session?.user?.id) {
    const wsMember = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: project.workspaceId,
          userId: session.user.id,
        },
      },
    });
    const ws = await db.workspace.findUnique({
      where: { id: project.workspaceId },
      select: { ownerId: true },
    });
    if (ws?.ownerId === session.user.id || wsMember) {
      isWorkspaceMember = true;
      workspaceRole = ws?.ownerId === session.user.id ? 'OWNER' : wsMember?.role || null;
    }
  }

  if (!access.hasAccess || (!isOwner && !isMember && !isPublic && !isWorkspaceMember)) {
    if (!session?.user?.id) {
      redirect('/login');
    }
    redirect('/dashboard');
  }

  // Fetch videos separately utilizing bounds
  const [paginatedVideos, totalVideos, allVideoIds, folderRows] = await Promise.all([
    db.video.findMany({
      where: { projectId: project.id },
      skip,
      take: pageSize,
      // フォルダ(未分類が先)→更新日時の順で並べ、ページをまたいでも
      // 同じフォルダの動画が固まるようにする(グルーピングはページ内のみ)
      orderBy: [
        { folder: { sort: 'asc', nulls: 'first' } },
        { updatedAt: sortOrder },
        { id: sortOrder },
      ],
      include: {
        versions: {
          where: { isActive: true },
          take: 1,
          include: {
            _count: { select: { comments: true } },
            // アクティブバージョンの最新承認依頼(バッジ表示用)。ネストselect+take:1でN+1を避ける
            approvalRequests: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true },
            },
          },
        },
        _count: { select: { versions: true } },
      },
    }),
    db.video.count({
      where: { projectId: project.id },
    }),
    db.video.findMany({
      where: { projectId: project.id },
      select: { id: true },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
    }),
    // フォルダ移動ダイアログ用に、プロジェクト内の既存フォルダ名一覧を取得
    db.video.findMany({
      where: { projectId: project.id, folder: { not: null } },
      select: { folder: true },
      distinct: ['folder'],
      orderBy: { folder: 'asc' },
    }),
  ]);

  const projectFolders = folderRows
    .map((row) => row.folder)
    .filter((folder): folder is string => typeof folder === 'string' && folder.length > 0);

  const totalPages = Math.ceil(totalVideos / pageSize);

  // Transform videos for VideoCard component
  const videos = paginatedVideos.map((video) => {
    const activeVersion = video.versions[0];
    // 最新の承認依頼が取消(CANCELED)の場合はバッジを出さない
    const latestApprovalStatus = activeVersion?.approvalRequests[0]?.status ?? null;
    return {
      id: video.id,
      title: video.title,
      // バージョン0件(企画のみ)は空文字にして VideoCard 側の「素材準備中」表示に落とす
      // (外部プレースホルダー画像は CSP の img-src で弾かれてスピナーが出続けるため使わない)
      thumbnailUrl: activeVersion?.thumbnailUrl || '',
      currentVersion: video._count.versions,
      commentCount: activeVersion?._count.comments || 0,
      duration: formatDuration(activeVersion?.duration),
      lastUpdated: formatRelativeTime(video.updatedAt),
      updatedAt: video.updatedAt.toISOString(),
      approvalStatus: latestApprovalStatus === 'CANCELED' ? null : latestApprovalStatus,
      folder: video.folder,
    };
  });

  const directUploadsEnabled = isDirectFileUploadEnabled();
  const directUploadProvider = isS3VideoUploadsEnabled() ? 'r2' : 'bunny';

  const canEdit =
    access.canEdit &&
    (isOwner ||
      project.members[0]?.role === 'ADMIN' ||
      workspaceRole === 'OWNER' ||
      workspaceRole === 'ADMIN');
  const isAuthenticated = !!session?.user?.id;

  const canDownloadProject = canDownloadProjectMedia(project, access);

  const projectData = {
    name: project.name,
    description: project.description,
    visibility: project.visibility,
    allowDownloads: project.allowDownloads,
    workspace: project.workspace,
    members: project.members,
  };

  // Guest name gate for unauthenticated users on public projects
  if (!isAuthenticated && isPublic) {
    return (
      <GuestGate>
        <div className="px-6 lg:px-8 py-8 w-full max-w-[1440px] mx-auto">
          {/* Back link */}
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              プロジェクト一覧に戻る
            </Link>
          </div>
          <ProjectContentClient
            project={projectData}
            projectId={projectId}
            videos={videos}
            allVideoIds={allVideoIds.map((video) => video.id)}
            projectFolders={projectFolders}
            canEdit={false}
            canDownloadProject={canDownloadProject}
            isOwner={false}
            workspaceRole={null}
            totalPages={totalPages}
            currentPage={page}
            pageSize={pageSize}
            directUploadsEnabled={directUploadsEnabled}
            directUploadProvider={directUploadProvider}
          />
        </div>
      </GuestGate>
    );
  }

  return (
    <div className="px-6 lg:px-8 py-8 w-full max-w-[1440px] mx-auto">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          プロジェクト一覧に戻る
        </Link>
      </div>
      <ProjectContentClient
        project={projectData}
        projectId={projectId}
        videos={videos}
        allVideoIds={allVideoIds.map((video) => video.id)}
        projectFolders={projectFolders}
        canEdit={canEdit}
        canDownloadProject={canDownloadProject}
        isOwner={isOwner}
        workspaceRole={workspaceRole}
        totalPages={totalPages}
        currentPage={page}
        pageSize={pageSize}
        directUploadsEnabled={directUploadsEnabled}
        directUploadProvider={directUploadProvider}
      />
    </div>
  );
}
