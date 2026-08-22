'use client';

import Link from 'next/link';
import { ArrowLeft, ClipboardList, FileVideo } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AssetsPane } from '@/components/video-page/assets-pane';
import { VersionActionsDialog } from '@/components/video-page/version-actions-dialog';
import type { VideoSource } from '@/lib/video-providers';
import type { DirectUploadProvider, VideoAsset } from '@/components/video-page/types';

/**
 * バージョン(動画本体)が1つもない「企画のみ」コンテンツの表示。
 *
 * 「先にコンテンツの箱を作る → 素材を集める → 編集者がバージョン1をアップロードする」
 * というバトンパスのための中間状態で、プレーヤーの代わりに素材パネルと
 * アップロード導線だけを出す。バージョンが1つでも追加されると通常のレビュー画面になる。
 */
interface PlanningVideoViewProps {
  backHref: string;
  title: string;
  projectName: string;
  description: string | null;
  canEdit: boolean;

  // バージョン追加ダイアログ(useVersionActions の状態をそのまま受ける)
  directUploadsEnabled: boolean;
  showVersionDialog: boolean;
  setShowVersionDialog: (open: boolean) => void;
  newVersionMode: 'url' | 'file';
  setNewVersionMode: (mode: 'url' | 'file') => void;
  newVersionUrl: string;
  handleNewVersionUrlChange: (url: string) => void;
  newVersionUrlError: string;
  newVersionSource: VideoSource | null;
  newVersionFile: File | null;
  setNewVersionFile: (file: File | null) => void;
  newVersionLabel: string;
  setNewVersionLabel: (label: string) => void;
  newVersionUploadStatus: string;
  newVersionUploadProgress: number;
  isCreatingVersion: boolean;
  onCreateVersion: () => void;

  // 素材パネル(useVideoAssets の状態をそのまま受ける)
  videoId: string;
  assets: VideoAsset[];
  isLoadingAssets: boolean;
  isCreatingAsset: boolean;
  deletingAssetIds: string[];
  activeDownloadAssetId: string | null;
  canUploadAssets: boolean;
  canDownloadAssets: boolean;
  getGuestUploadToken: (intent: 'image' | 'audio') => Promise<string | null>;
  createAsset: Parameters<typeof AssetsPane>[0]['createAsset'];
  deleteAsset: Parameters<typeof AssetsPane>[0]['deleteAsset'];
  downloadAsset: Parameters<typeof AssetsPane>[0]['downloadAsset'];
  hasMoreAssets: boolean;
  isLoadingMoreAssets: boolean;
  loadMoreAssets: () => Promise<void>;
  directUploadProvider: DirectUploadProvider;
}

export function PlanningVideoView(props: PlanningVideoViewProps) {
  const {
    backHref,
    title,
    projectName,
    description,
    canEdit,
    directUploadsEnabled,
    showVersionDialog,
    setShowVersionDialog,
    newVersionMode,
    setNewVersionMode,
    newVersionUrl,
    handleNewVersionUrlChange,
    newVersionUrlError,
    newVersionSource,
    newVersionFile,
    setNewVersionFile,
    newVersionLabel,
    setNewVersionLabel,
    newVersionUploadStatus,
    newVersionUploadProgress,
    isCreatingVersion,
    onCreateVersion,
    videoId,
  } = props;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-[1440px] px-6 lg:px-8 py-8">
        {/* ヘッダー */}
        <div className="mb-6">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            {projectName} に戻る
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="truncate text-2xl font-bold tracking-tight">{title}</h1>
              <Badge variant="secondary" className="flex items-center gap-1 shrink-0">
                <ClipboardList className="h-3.5 w-3.5" />
                素材準備中
              </Badge>
            </div>
            {canEdit && (
              <VersionActionsDialog
                open={showVersionDialog}
                onOpenChange={setShowVersionDialog}
                directUploadsEnabled={directUploadsEnabled}
                directUploadProvider={props.directUploadProvider}
                newVersionMode={newVersionMode}
                onNewVersionModeChange={setNewVersionMode}
                newVersionUrl={newVersionUrl}
                onNewVersionUrlChange={handleNewVersionUrlChange}
                newVersionUrlError={newVersionUrlError}
                newVersionSource={newVersionSource}
                newVersionFile={newVersionFile}
                onNewVersionFileChange={setNewVersionFile}
                newVersionLabel={newVersionLabel}
                onNewVersionLabelChange={setNewVersionLabel}
                newVersionUploadStatus={newVersionUploadStatus}
                newVersionUploadProgress={newVersionUploadProgress}
                isCreatingVersion={isCreatingVersion}
                versionsCount={0}
                onCreateVersion={onCreateVersion}
              />
            )}
          </div>
          {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
          {/* 説明 */}
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border bg-card/30 p-10 text-center">
            <FileVideo className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-medium">動画はまだアップロードされていません</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              このコンテンツは企画・素材集めの段階です。右の素材パネルに参考資料や素材を
              集めておくと、編集者がそのまま引き継げます。動画が完成したら
              「新規バージョン」からバージョン1をアップロードするとレビューを開始できます。
            </p>
          </div>

          {/* 素材パネル */}
          <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-md border border-border bg-card">
            <AssetsPane
              videoId={videoId}
              assets={props.assets}
              isLoadingAssets={props.isLoadingAssets}
              isCreatingAsset={props.isCreatingAsset}
              deletingAssetIds={props.deletingAssetIds}
              activeDownloadAssetId={props.activeDownloadAssetId}
              canUploadAssets={props.canUploadAssets}
              canDownloadAssets={props.canDownloadAssets}
              getGuestUploadToken={props.getGuestUploadToken}
              createAsset={props.createAsset}
              deleteAsset={props.deleteAsset}
              downloadAsset={props.downloadAsset}
              hasMoreAssets={props.hasMoreAssets}
              isLoadingMoreAssets={props.isLoadingMoreAssets}
              loadMoreAssets={props.loadMoreAssets}
              highlightedAssetId={null}
              onHighlightedAssetHandled={() => undefined}
              directUploadProvider={props.directUploadProvider}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
