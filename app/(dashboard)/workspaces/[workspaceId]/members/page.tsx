import { MembersManagementPage } from '@/components/members-management-page';
import { requireWorkspaceAccessOrRedirect } from '@/lib/route-access';

interface WorkspaceMembersPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function WorkspaceMembersPage({ params }: WorkspaceMembersPageProps) {
  const { workspaceId } = await params;

  await requireWorkspaceAccessOrRedirect({
    workspaceId,
    intent: 'manage',
  });

  return (
    <MembersManagementPage
      apiBasePath={`/api/workspaces/${workspaceId}`}
      backHref={`/workspaces/${workspaceId}`}
      backLabel="ワークスペースに戻る"
      title="メンバー"
      subtitle="このワークスペースとすべてのプロジェクトへのアクセス権を管理します"
      membersDescription="管理者はプロジェクトとメンバーを管理できます。コメント担当者は閲覧とコメントのみ可能です。"
    />
  );
}
