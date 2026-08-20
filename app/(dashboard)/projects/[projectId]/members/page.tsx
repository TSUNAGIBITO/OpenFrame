import { MembersManagementPage } from '@/components/members-management-page';
import { requireProjectAccessOrRedirect } from '@/lib/route-access';

interface ProjectMembersPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectMembersPage({ params }: ProjectMembersPageProps) {
  const { projectId } = await params;

  await requireProjectAccessOrRedirect({
    projectId,
    intent: 'manage',
  });

  return (
    <MembersManagementPage
      apiBasePath={`/api/projects/${projectId}`}
      backHref={`/projects/${projectId}`}
      backLabel="プロジェクトに戻る"
      title="プロジェクトメンバー"
      subtitle="このプロジェクトへのアクセス権を管理します。管理者は設定の変更やコンテンツの削除ができます。コメント担当者は閲覧とコメントのみ可能です。"
      membersDescription={
        <>
          <strong>管理者</strong> - プロジェクト設定・メンバーの管理、コンテンツの削除ができます。{' '}
          <strong>コメント担当者</strong> - 閲覧とコメントのみ可能です。
        </>
      }
    />
  );
}
