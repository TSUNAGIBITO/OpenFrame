'use client';

import Link from 'next/link';
import { Clock3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectFilter } from './project-filter';
import { VideoDragDropUploader } from '@/components/video-drag-drop-uploader';
import type { DirectUploadProvider } from '@/components/video-page/types';

interface PendingApprovalItem {
  decisionId: string;
  videoId: string;
  videoTitle: string;
  projectId: string;
  projectName: string;
  requesterName: string;
}

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

interface DashboardClientProps {
  pendingApprovals: PendingApprovalItem[];
  pendingApprovalCount: number;
  serializedProjects: SerializedProject[];
  workspaces: { id: string; name: string }[];
  totalPages: number;
  canCreateProjects: boolean;
  canUploadVideos: boolean;
  directUploadsEnabled: boolean;
  directUploadProvider: DirectUploadProvider;
}

export function DashboardClient({
  pendingApprovals,
  pendingApprovalCount,
  serializedProjects,
  workspaces,
  totalPages,
  canCreateProjects,
  canUploadVideos,
  directUploadsEnabled,
  directUploadProvider,
}: DashboardClientProps) {
  return (
    <div className="px-6 lg:px-8 py-8 w-full max-w-[1440px] mx-auto">
      <VideoDragDropUploader
        canUpload={canUploadVideos && directUploadsEnabled}
        directUploadProvider={directUploadProvider}
      />
      {/* あなたの承認待ち: 自分が承認者として未回答の依頼への導線 */}
      {pendingApprovalCount > 0 && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">
                あなたの承認待ち {pendingApprovalCount}件
              </h2>
            </div>
            <ul className="space-y-1">
              {pendingApprovals.map((item) => (
                <li key={item.decisionId}>
                  <Link
                    href={`/projects/${item.projectId}/videos/${item.videoId}`}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{item.videoTitle}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.projectName} · {item.requesterName}さんから
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <ProjectFilter
        projects={serializedProjects}
        workspaces={workspaces}
        totalPages={totalPages}
        canCreateProjects={canCreateProjects}
      />
    </div>
  );
}
