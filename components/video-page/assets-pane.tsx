'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as tus from 'tus-js-client';
import { toast } from 'sonner';
import { toastApiError } from '@/lib/client/api-error';
import {
  Download,
  ExternalLink,
  FileVideo,
  Image as ImageIcon,
  Link2,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  UploadCloud,
  Volume2,
  X,
  Youtube,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ImagePreviewDialog } from '@/components/video-page/image-preview-dialog';
import {
  BunnyPreviewPlayer,
  type BunnyPreviewPlayerHandle,
} from '@/components/video-page/bunny-preview-player';
import { AssetListSection } from '@/components/video-page/asset-list-section';
import type { DirectUploadProvider, VideoAsset } from '@/components/video-page/types';
import { uploadAssetVideoToR2 } from '@/lib/client/r2-asset-video-upload';
import {
  extractPastedImageFiles,
  validateImageFile,
} from '@/components/video-page/image-upload-utils';
import { useCommentMedia } from '@/components/video-page/hooks/use-comment-media';
import { withWebmDuration } from '@/lib/webm-duration';
import { resolvePublicBunnyCdnHostname } from '@/lib/bunny-cdn';
import { cn } from '@/lib/utils';

const MAX_AUDIO_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_UPLOAD_SIZE_MESSAGE = 'ファイルが大きすぎます。最大サイズは10MBです。';

function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

type UploadAudioResponse = {
  data?: { url?: string; reservationId?: string | null };
  error?: string;
  code?: string;
};

function getAudioUploadValidationError(file: Blob): string | null {
  if (file.size > MAX_AUDIO_UPLOAD_SIZE) {
    return MAX_AUDIO_UPLOAD_SIZE_MESSAGE;
  }
  return null;
}

function getLinkHostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

async function readUploadAudioResponse(response: Response): Promise<UploadAudioResponse | null> {
  const raw = await response.text().catch(() => '');
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed) as UploadAudioResponse;
  } catch {
    if (trimmed.startsWith('<')) return null;
    return { error: trimmed };
  }
}

interface AssetsPaneProps {
  videoId: string;
  assets: VideoAsset[];
  isLoadingAssets: boolean;
  isCreatingAsset: boolean;
  deletingAssetIds: string[];
  activeDownloadAssetId: string | null;
  canUploadAssets: boolean;
  canDownloadAssets: boolean;
  getGuestUploadToken: (intent: 'image' | 'audio') => Promise<string | null>;
  createAsset: (payload: {
    provider: 'R2_IMAGE' | 'YOUTUBE' | 'BUNNY' | 'R2_AUDIO' | 'R2_VIDEO' | 'EXTERNAL_LINK';
    displayName?: string;
    sourceUrl: string;
    providerVideoId?: string;
    thumbnailUrl?: string;
    uploadToken?: string;
    objectKey?: string;
    reservationId?: string | null;
  }) => Promise<VideoAsset | null>;
  deleteAsset: (assetId: string) => Promise<boolean>;
  downloadAsset: (asset: VideoAsset, preference?: 'original' | 'compressed') => Promise<void>;
  hasMoreAssets: boolean;
  isLoadingMoreAssets: boolean;
  loadMoreAssets: () => Promise<void>;
  highlightedAssetId: string | null;
  onHighlightedAssetHandled: () => void;
  directUploadProvider?: DirectUploadProvider;
}

export const AssetsPane = memo(function AssetsPane({
  videoId,
  assets,
  isLoadingAssets,
  isCreatingAsset,
  deletingAssetIds,
  activeDownloadAssetId,
  canUploadAssets,
  canDownloadAssets,
  getGuestUploadToken,
  createAsset,
  deleteAsset,
  downloadAsset,
  hasMoreAssets,
  isLoadingMoreAssets,
  loadMoreAssets,
  highlightedAssetId,
  onHighlightedAssetHandled,
  directUploadProvider = 'bunny',
}: AssetsPaneProps) {
  const [uploadTab, setUploadTab] = useState<'image' | 'youtube' | 'bunny' | 'voice' | 'link'>(
    'image'
  );
  const [imageTitle, setImageTitle] = useState('');
  const [pendingImageFiles, setPendingImageFiles] = useState<File[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [bunnyTitle, setBunnyTitle] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingBunny, setIsUploadingBunny] = useState(false);
  const [bunnyProgress, setBunnyProgress] = useState(0);
  const [bunnyUploadLabel, setBunnyUploadLabel] = useState('');
  const [bunnyProcessingByAssetId, setBunnyProcessingByAssetId] = useState<Record<string, boolean>>(
    {}
  );
  const [bunnyReadyByAssetId, setBunnyReadyByAssetId] = useState<Record<string, boolean>>({});
  const [bunnyThumbnailRetryKeyByAssetId, setBunnyThumbnailRetryKeyByAssetId] = useState<
    Record<string, number>
  >({});
  const [bunnyThumbnailLoadErrorByAssetId, setBunnyThumbnailLoadErrorByAssetId] = useState<
    Record<string, boolean>
  >({});
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImageTitle, setPreviewImageTitle] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<VideoAsset | null>(null);
  const bunnyCdnHostname = useMemo(() => resolvePublicBunnyCdnHostname(), []);
  const [focusedAssetId, setFocusedAssetId] = useState<string | null>(null);
  const bunnyPreviewPlayerRef = useRef<BunnyPreviewPlayerHandle | null>(null);
  const youtubeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const youtubePreviewStateRef = useRef({ currentTime: 0, isPlaying: false, isMuted: false });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bunnyInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [voiceTitle, setVoiceTitle] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [pendingAudioFiles, setPendingAudioFiles] = useState<File[]>([]);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartedAtRef = useRef(0);

  // Drag-drop state
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // Audio playback for asset preview dialog and recording preview
  const {
    playingVoiceId,
    voiceProgress,
    voiceCurrentTime,
    voicePlaybackRate,
    playVoice,
    stopVoice,
    toggleVoiceSpeed,
  } = useCommentMedia();

  const sortedAssets = useMemo(() => {
    return [...assets].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [assets]);

  useEffect(() => {
    if (!highlightedAssetId) return;

    const element = document.getElementById(`asset-card-${highlightedAssetId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFocusedAssetId(highlightedAssetId);
      window.setTimeout(
        () => setFocusedAssetId((prev) => (prev === highlightedAssetId ? null : prev)),
        2500
      );
    }

    onHighlightedAssetHandled();
  }, [highlightedAssetId, onHighlightedAssetHandled]);

  useEffect(() => {
    if (!selectedAsset || selectedAsset.kind !== 'VIDEO') return;

    const sendYouTubeCommand = (func: string, args: unknown[] = []) => {
      const iframe = youtubeIframeRef.current;
      if (!iframe?.contentWindow) return;
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: 'command',
          func,
          args,
        }),
        '*'
      );
    };

    const onMessage = (event: MessageEvent) => {
      if (!selectedAsset || selectedAsset.provider !== 'YOUTUBE') return;
      if (typeof event.data !== 'string') return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      const info = (
        parsed as { info?: { currentTime?: number; playerState?: number; muted?: boolean } }
      )?.info;
      if (!info) return;
      if (typeof info.currentTime === 'number') {
        youtubePreviewStateRef.current.currentTime = info.currentTime;
      }
      if (typeof info.playerState === 'number') {
        youtubePreviewStateRef.current.isPlaying = info.playerState === 1;
      }
      if (typeof info.muted === 'boolean') {
        youtubePreviewStateRef.current.isMuted = info.muted;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!selectedAsset || selectedAsset.kind !== 'VIDEO') return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      )
        return;

      const handledKeys = new Set([
        'Space',
        'KeyK',
        'ArrowLeft',
        'ArrowRight',
        'KeyJ',
        'KeyL',
        'KeyM',
        'Escape',
      ]);
      if (!handledKeys.has(event.code)) return;

      event.preventDefault();
      event.stopPropagation();

      if (event.code === 'Escape') {
        setSelectedAsset(null);
        return;
      }

      if (selectedAsset.provider === 'BUNNY') {
        switch (event.code) {
          case 'Space':
          case 'KeyK':
            bunnyPreviewPlayerRef.current?.togglePlayPause();
            break;
          case 'ArrowLeft':
          case 'KeyJ':
            bunnyPreviewPlayerRef.current?.seekBy(-10);
            break;
          case 'ArrowRight':
          case 'KeyL':
            bunnyPreviewPlayerRef.current?.seekBy(10);
            break;
          case 'KeyM':
            bunnyPreviewPlayerRef.current?.toggleMute();
            break;
        }
        return;
      }

      if (selectedAsset.provider === 'YOUTUBE') {
        switch (event.code) {
          case 'Space':
          case 'KeyK': {
            const isPlaying = youtubePreviewStateRef.current.isPlaying;
            sendYouTubeCommand(isPlaying ? 'pauseVideo' : 'playVideo');
            youtubePreviewStateRef.current.isPlaying = !isPlaying;
            break;
          }
          case 'ArrowLeft':
          case 'KeyJ': {
            const next = Math.max(0, youtubePreviewStateRef.current.currentTime - 10);
            sendYouTubeCommand('seekTo', [next, true]);
            youtubePreviewStateRef.current.currentTime = next;
            break;
          }
          case 'ArrowRight':
          case 'KeyL': {
            const next = youtubePreviewStateRef.current.currentTime + 10;
            sendYouTubeCommand('seekTo', [next, true]);
            youtubePreviewStateRef.current.currentTime = next;
            break;
          }
          case 'KeyM': {
            const isMuted = youtubePreviewStateRef.current.isMuted;
            sendYouTubeCommand(isMuted ? 'unMute' : 'mute');
            youtubePreviewStateRef.current.isMuted = !isMuted;
            break;
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('message', onMessage);
    };
  }, [selectedAsset]);

  useEffect(() => {
    if (!selectedAsset || selectedAsset.provider !== 'BUNNY') return;
    if (bunnyReadyByAssetId[selectedAsset.id]) return;
    setBunnyProcessingByAssetId((prev) =>
      prev[selectedAsset.id] ? prev : { ...prev, [selectedAsset.id]: true }
    );
  }, [bunnyReadyByAssetId, selectedAsset]);

  const uploadSingleImageAsset = useCallback(
    async (file: File, displayName?: string): Promise<boolean> => {
      const imageError = await validateImageFile(file);
      if (imageError) {
        toast.error(`${file.name}: ${imageError}`);
        return false;
      }

      try {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('videoId', videoId);
        const guestUploadToken = await getGuestUploadToken('image');
        if (guestUploadToken) formData.append('uploadToken', guestUploadToken);

        const uploadRes = await fetch('/api/upload/image', {
          method: 'POST',
          body: formData,
        });
        const uploadPayload = (await uploadRes.json().catch(() => null)) as {
          data?: { url?: string; reservationId?: string | null };
          error?: string;
          code?: string;
        } | null;
        const uploadedImageUrl = uploadPayload?.data?.url;
        if (!uploadRes.ok || !uploadedImageUrl) {
          toastApiError(uploadPayload, '画像のアップロードに失敗しました', { prefix: file.name });
          return false;
        }

        const created = await createAsset({
          provider: 'R2_IMAGE',
          sourceUrl: uploadedImageUrl,
          displayName: displayName?.trim() || file.name,
          reservationId: uploadPayload?.data?.reservationId ?? null,
        });
        return !!created;
      } catch (error) {
        console.error('Failed to upload image asset:', error);
        toastApiError(error, '画像のアップロードに失敗しました', { prefix: file.name });
        return false;
      }
    },
    [videoId, getGuestUploadToken, createAsset]
  );

  const handleImageUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      setIsUploadingImage(true);
      let successCount = 0;
      let failCount = 0;

      try {
        for (const file of files) {
          const displayName = imageTitle.trim() || file.name;
          const ok = await uploadSingleImageAsset(file, displayName);
          if (ok) successCount += 1;
          else failCount += 1;
        }

        if (successCount > 0) {
          if (imageInputRef.current) imageInputRef.current.value = '';
          setImageTitle('');
          setPendingImageFiles([]);
        }

        if (successCount > 0 && failCount === 0) {
          toast.success(successCount === 1 ? '画像をアップロードしました' : `${successCount}件の画像をアップロードしました`);
        } else if (successCount > 0 && failCount > 0) {
          toast.warning(`${successCount}件成功、${failCount}件失敗`);
        }
      } finally {
        setIsUploadingImage(false);
      }
    },
    [imageTitle, uploadSingleImageAsset]
  );

  const stageImageFiles = useCallback(async (files: File[]) => {
    const validFiles: File[] = [];
    for (const file of files) {
      const imageError = await validateImageFile(file);
      if (imageError) {
        toast.error(`${file.name}: ${imageError}`);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    setPendingImageFiles((prev) => {
      const next = [...prev];
      for (const file of validFiles) {
        const duplicate = next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );
        if (!duplicate) next.push(file);
      }
      return next;
    });

    toast.success(
      validFiles.length === 1
        ? '画像を添付しました。「アップロード」を押して送信してください。'
        : `${validFiles.length}件の画像を添付しました。「アップロード」を押して送信してください。`
    );
  }, []);

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setUploadTab('image');
    await stageImageFiles(files);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleImagePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (uploadTab !== 'image' || !canUploadAssets || isCreatingAsset) return;
    const pastedImages = extractPastedImageFiles(event.clipboardData);
    if (pastedImages.length === 0) return;
    event.preventDefault();
    await stageImageFiles(pastedImages);
  };

  const handleCreateYoutubeAsset = async () => {
    if (!youtubeUrl.trim()) return;
    const created = await createAsset({
      provider: 'YOUTUBE',
      sourceUrl: youtubeUrl.trim(),
      displayName: youtubeTitle.trim() || undefined,
    });
    if (created) {
      setYoutubeUrl('');
      setYoutubeTitle('');
    }
  };

  const handleCreateLinkAsset = async () => {
    const sourceUrl = linkUrl.trim();
    const displayName = linkTitle.trim();
    if (!sourceUrl || !displayName) return;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(sourceUrl);
    } catch {
      toast.error('URLの形式が正しくありません');
      return;
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      toast.error('http:// または https:// で始まるURLを入力してください');
      return;
    }

    const created = await createAsset({
      provider: 'EXTERNAL_LINK',
      sourceUrl,
      displayName,
    });
    if (created) {
      setLinkUrl('');
      setLinkTitle('');
    }
  };

  const handleBunnyFileUpload = useCallback(
    async (file: File, options?: { index?: number; total?: number }) => {
      if (!file.type.startsWith('video/')) {
        toast.error(`${file.name}: 動画ファイルを選択してください`);
        return false;
      }

      let uploadedVideoId: string | null = null;
      let uploadToken: string | null = null;
      try {
        setIsUploadingBunny(true);
        setBunnyProgress(0);
        if (options?.total && options.total > 1) {
          setBunnyUploadLabel(`アップロード中 ${options.index ?? 1}/${options.total}: ${file.name}`);
        } else {
          setBunnyUploadLabel('');
        }

        const initRes = await fetch(`/api/videos/${videoId}/assets/bunny-init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: bunnyTitle.trim() || file.name.replace(/\.[^/.]+$/, ''),
            sizeBytes: file.size.toString(),
          }),
        });
        const initPayload = (await initRes.json().catch(() => null)) as {
          data?: {
            videoId: string;
            libraryId: string;
            signature: string;
            expirationTime: number;
            uploadToken: string;
          };
          error?: string;
          code?: string;
        } | null;

        if (!initRes.ok || !initPayload?.data) {
          toastApiError(initPayload, 'アップロードの初期化に失敗しました', { prefix: file.name });
          return false;
        }

        const initData = initPayload.data;
        uploadedVideoId = initData.videoId;
        uploadToken = initData.uploadToken;

        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: 'https://video.bunnycdn.com/tusupload',
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
              AuthorizationSignature: initData.signature,
              AuthorizationExpire: initData.expirationTime.toString(),
              VideoId: initData.videoId,
              LibraryId: initData.libraryId,
            },
            metadata: {
              filetype: file.type,
              title: file.name,
            },
            onError: (error) => reject(error),
            onProgress: (bytesUploaded, bytesTotal) => {
              const percentage = bytesTotal > 0 ? (bytesUploaded / bytesTotal) * 100 : 0;
              setBunnyProgress(Math.min(100, Math.max(0, percentage)));
            },
            onSuccess: () => resolve(),
          });
          upload.start();
        });

        const sourceUrl = `https://iframe.mediadelivery.net/embed/${initData.libraryId}/${initData.videoId}`;
        const thumbnailUrl = bunnyCdnHostname
          ? `https://${bunnyCdnHostname}/${initData.videoId}/thumbnail.jpg`
          : undefined;
        const createdAsset = await createAsset({
          provider: 'BUNNY',
          sourceUrl,
          providerVideoId: initData.videoId,
          uploadToken: initData.uploadToken,
          thumbnailUrl,
          displayName: bunnyTitle.trim() || file.name,
        });
        if (!createdAsset) {
          throw new Error('Failed to finalize Bunny asset');
        }
        setBunnyReadyByAssetId((prev) => ({ ...prev, [createdAsset.id]: false }));
        setBunnyProcessingByAssetId((prev) => ({ ...prev, [createdAsset.id]: true }));
        return true;
      } catch (error) {
        console.error('Failed to upload Bunny asset:', error);
        toastApiError(error, '動画のアップロードに失敗しました', { prefix: file.name });
        if (uploadedVideoId && uploadToken) {
          await fetch(`/api/videos/${videoId}/assets/bunny-init`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: uploadedVideoId, uploadToken }),
          }).catch(() => undefined);
        }
        return false;
      } finally {
        setIsUploadingBunny(false);
        setBunnyProgress(0);
        setBunnyUploadLabel('');
      }
    },
    [videoId, bunnyTitle, bunnyCdnHostname, createAsset]
  );

  const handleR2FileUpload = useCallback(
    async (file: File, options?: { index?: number; total?: number }) => {
      if (!file.type.startsWith('video/')) {
        toast.error(`${file.name}: 動画ファイルを選択してください`);
        return false;
      }

      try {
        setIsUploadingBunny(true);
        setBunnyProgress(0);
        if (options?.total && options.total > 1) {
          setBunnyUploadLabel(`アップロード中 ${options.index ?? 1}/${options.total}: ${file.name}`);
        } else {
          setBunnyUploadLabel('');
        }

        const uploadResult = await uploadAssetVideoToR2(videoId, file, {
          onProgress: (progress) => setBunnyProgress(progress),
        });

        const createdAsset = await createAsset({
          provider: 'R2_VIDEO',
          sourceUrl: uploadResult.proxyUrl,
          objectKey: uploadResult.objectKey,
          uploadToken: uploadResult.uploadToken,
          reservationId: uploadResult.reservationId,
          thumbnailUrl: uploadResult.thumbnailUrl ?? undefined,
          displayName: bunnyTitle.trim() || file.name,
        });
        if (!createdAsset) {
          throw new Error('Failed to finalize video asset');
        }
        return true;
      } catch (error) {
        console.error('Failed to upload R2 asset video:', error);
        toastApiError(error, '動画のアップロードに失敗しました', { prefix: file.name });
        return false;
      } finally {
        setIsUploadingBunny(false);
        setBunnyProgress(0);
        setBunnyUploadLabel('');
      }
    },
    [videoId, bunnyTitle, createAsset]
  );

  const handleVideoFileUpload = useCallback(
    (file: File, options?: { index?: number; total?: number }) => {
      if (directUploadProvider === 'r2') {
        return handleR2FileUpload(file, options);
      }
      return handleBunnyFileUpload(file, options);
    },
    [directUploadProvider, handleBunnyFileUpload, handleR2FileUpload]
  );

  const handleVideoBatchUpload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      let successCount = 0;
      let failCount = 0;

      for (let index = 0; index < files.length; index++) {
        const ok = await handleVideoFileUpload(files[index], {
          index: index + 1,
          total: files.length,
        });
        if (ok) successCount += 1;
        else failCount += 1;
      }

      if (bunnyInputRef.current) bunnyInputRef.current.value = '';
      if (successCount > 0) setBunnyTitle('');

      if (successCount > 0 && failCount === 0) {
        toast.success(successCount === 1 ? '動画をアップロードしました' : `${successCount}件の動画をアップロードしました`);
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`${successCount}件成功、${failCount}件失敗`);
      }
    },
    [handleVideoFileUpload]
  );

  const handleBunnyUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith('video/')
    );
    if (files.length === 0) {
      toast.error('有効な動画ファイルを選択してください');
      return;
    }
    await handleVideoBatchUpload(files);
  };

  const handleBunnyThumbnailError = (assetId: string) => {
    const alreadyReady = !!bunnyReadyByAssetId[assetId];
    setBunnyThumbnailLoadErrorByAssetId((prev) => ({ ...prev, [assetId]: true }));
    if (!alreadyReady) {
      setBunnyProcessingByAssetId((prev) => (prev[assetId] ? prev : { ...prev, [assetId]: true }));
      setBunnyReadyByAssetId((prev) => ({ ...prev, [assetId]: false }));
    }
    window.setTimeout(() => {
      setBunnyThumbnailRetryKeyByAssetId((prev) => ({ ...prev, [assetId]: Date.now() }));
      setBunnyThumbnailLoadErrorByAssetId((prev) => ({ ...prev, [assetId]: false }));
    }, 10000);
  };

  const handleBunnyThumbnailLoad = (assetId: string) => {
    setBunnyThumbnailLoadErrorByAssetId((prev) => {
      if (!prev[assetId]) return prev;
      return { ...prev, [assetId]: false };
    });
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const elapsedMs = Date.now() - recordingStartedAtRef.current;
        const raw = new Blob(audioChunksRef.current, { type: mimeType });
        // MediaRecorder leaves the WebM duration unset, so stamp it in before the
        // blob reaches a player or the upload.
        const blob = await withWebmDuration(raw, elapsedMs);
        setRecordingTime(elapsedMs / 1000);
        setAudioBlob(blob);
        setAudioBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      // Background tabs throttle timers, so read the clock instead of counting ticks.
      recordingStartedAtRef.current = Date.now();
      recordingTimerRef.current = setInterval(
        () => setRecordingTime((Date.now() - recordingStartedAtRef.current) / 1000),
        250
      );
    } catch {
      toast.error('マイクにアクセスできませんでした');
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingTime(0);
    setAudioBlob(null);
    setAudioBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPendingAudioFiles([]);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const uploadSingleAudioAsset = useCallback(
    async (file: File | Blob, fileName: string, displayName?: string): Promise<boolean> => {
      const validationError = getAudioUploadValidationError(file);
      if (validationError) {
        toast.error(`${fileName}: ${validationError}`);
        return false;
      }

      try {
        const formData = new FormData();
        formData.append('audio', file, file instanceof File ? file.name : 'recording.webm');
        formData.append('videoId', videoId);
        const guestUploadToken = await getGuestUploadToken('audio');
        if (guestUploadToken) formData.append('uploadToken', guestUploadToken);

        const uploadRes = await fetch('/api/upload/audio', {
          method: 'POST',
          body: formData,
        });
        const uploadPayload = await readUploadAudioResponse(uploadRes);
        const uploadedUrl = uploadPayload?.data?.url;
        if (!uploadRes.ok || !uploadedUrl) {
          toastApiError(
            uploadPayload,
            uploadRes.status === 413
              ? MAX_AUDIO_UPLOAD_SIZE_MESSAGE
              : '音声のアップロードに失敗しました',
            { prefix: fileName }
          );
          return false;
        }

        const created = await createAsset({
          provider: 'R2_AUDIO',
          sourceUrl: uploadedUrl,
          displayName:
            displayName?.trim() || fileName.replace(/\.[^/.]+$/, '') || '音声録音',
          reservationId: uploadPayload?.data?.reservationId ?? null,
        });
        return !!created;
      } catch (error) {
        console.error('Failed to upload voice asset:', error);
        toastApiError(error, '音声のアップロードに失敗しました', { prefix: fileName });
        return false;
      }
    },
    [videoId, getGuestUploadToken, createAsset]
  );

  const stageAudioFiles = useCallback((files: File[]) => {
    const validFiles: File[] = [];
    for (const file of files) {
      const audioError = getAudioUploadValidationError(file);
      if (audioError) {
        toast.error(`${file.name}: ${audioError}`);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    setPendingAudioFiles((prev) => {
      const next = [...prev];
      for (const file of validFiles) {
        const duplicate = next.some(
          (existing) =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );
        if (!duplicate) next.push(file);
      }
      return next;
    });

    toast.success(
      validFiles.length === 1
        ? '音声ファイルを添付しました。「アップロード」を押して送信してください。'
        : `${validFiles.length}件の音声ファイルを添付しました。「アップロード」を押して送信してください。`
    );
  }, []);

  const handleVoiceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setUploadTab('voice');
    stageAudioFiles(files);
    if (voiceInputRef.current) voiceInputRef.current.value = '';
  };

  const handleVoiceUpload = useCallback(async () => {
    if (audioBlob && pendingAudioFiles.length === 0) {
      setIsUploadingVoice(true);
      try {
        const ok = await uploadSingleAudioAsset(
          audioBlob,
          'recording.webm',
          voiceTitle.trim() || '音声録音'
        );
        if (ok) {
          setVoiceTitle('');
          setAudioBlob(null);
          setAudioBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }
      } finally {
        setIsUploadingVoice(false);
      }
      return;
    }

    if (pendingAudioFiles.length === 0) return;

    setIsUploadingVoice(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const file of pendingAudioFiles) {
        const displayName = voiceTitle.trim() || file.name.replace(/\.[^/.]+$/, '');
        const ok = await uploadSingleAudioAsset(file, file.name, displayName);
        if (ok) successCount += 1;
        else failCount += 1;
      }

      if (successCount > 0) {
        setVoiceTitle('');
        setPendingAudioFiles([]);
        if (voiceInputRef.current) voiceInputRef.current.value = '';
      }

      if (successCount > 0 && failCount === 0) {
        toast.success(
          successCount === 1 ? '音声をアップロードしました' : `${successCount}件の音声ファイルをアップロードしました`
        );
      } else if (successCount > 0 && failCount > 0) {
        toast.warning(`${successCount}件成功、${failCount}件失敗`);
      }
    } finally {
      setIsUploadingVoice(false);
    }
  }, [audioBlob, pendingAudioFiles, uploadSingleAudioAsset, voiceTitle]);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!canUploadAssets) return;
      dragCounterRef.current += 1;
      if (e.dataTransfer.types.includes('Files')) setIsDragOver(true);
    },
    [canUploadAssets]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (!canUploadAssets) return;

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const imageFiles: File[] = [];
      const videoFiles: File[] = [];
      const audioFiles: File[] = [];
      let unsupportedCount = 0;

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          imageFiles.push(file);
        } else if (file.type.startsWith('video/')) {
          videoFiles.push(file);
        } else if (file.type.startsWith('audio/')) {
          audioFiles.push(file);
        } else {
          unsupportedCount += 1;
          toast.error(`${file.name}: 対応していないファイル形式です`);
        }
      }

      if (imageFiles.length > 0) {
        setUploadTab('image');
        await stageImageFiles(imageFiles);
      }

      if (audioFiles.length > 0) {
        setUploadTab('voice');
        stageAudioFiles(audioFiles);
      }

      if (videoFiles.length > 0) {
        setUploadTab('bunny');
        await handleVideoBatchUpload(videoFiles);
      }

      if (
        imageFiles.length === 0 &&
        videoFiles.length === 0 &&
        audioFiles.length === 0 &&
        unsupportedCount === 0
      ) {
        toast.error('画像・動画・音声ファイルをドロップしてください。');
      }
    },
    [canUploadAssets, handleVideoBatchUpload, stageAudioFiles, stageImageFiles]
  );

  const renderAssetPreview = (asset: VideoAsset) => {
    if (asset.kind === 'LINK') {
      const hostname = getLinkHostname(asset.sourceUrl);
      return (
        <div className="h-24 w-36 rounded border bg-muted flex flex-col items-center justify-center gap-1 px-2">
          <Link2 className="h-6 w-6 text-muted-foreground" />
          <span className="max-w-full truncate text-[10px] text-muted-foreground font-medium">
            {hostname || '外部リンク'}
          </span>
        </div>
      );
    }

    if (asset.kind === 'AUDIO') {
      return (
        <div className="h-24 w-36 rounded border bg-muted flex flex-col items-center justify-center gap-1">
          <Volume2 className="h-6 w-6 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">音声録音</span>
        </div>
      );
    }

    if (asset.kind === 'IMAGE') {
      const imageSrc = asset.thumbnailUrl || asset.sourceUrl;
      return (
        <div className="h-24 w-36 rounded border bg-black/20 flex items-center justify-center overflow-hidden">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt={asset.displayName} className="h-full w-full object-contain" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
      );
    }

    if (asset.provider === 'YOUTUBE' && asset.providerVideoId) {
      return (
        <div className="h-24 w-36 rounded border overflow-hidden bg-black/70 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={
              asset.thumbnailUrl ||
              `https://img.youtube.com/vi/${asset.providerVideoId}/mqdefault.jpg`
            }
            alt={asset.displayName}
            className="h-full w-full object-contain"
          />
        </div>
      );
    }

    if (asset.provider === 'R2_VIDEO') {
      const thumbnailSrc = asset.thumbnailUrl;
      return (
        <div className="h-24 w-36 rounded border overflow-hidden bg-black/70 relative flex items-center justify-center">
          {thumbnailSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbnailSrc}
              alt={asset.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <FileVideo className="h-6 w-6 text-muted-foreground" />
          )}
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <Play className="h-4 w-4 text-white" />
          </div>
        </div>
      );
    }

    const retryKey = bunnyThumbnailRetryKeyByAssetId[asset.id] || 0;
    const isProcessing = !!bunnyProcessingByAssetId[asset.id];
    const isReadyToPlay = !!bunnyReadyByAssetId[asset.id];
    const hasThumbnailLoadError = !!bunnyThumbnailLoadErrorByAssetId[asset.id];
    const thumbnailSrc = asset.thumbnailUrl
      ? `${asset.thumbnailUrl}${retryKey ? `?t=${retryKey}` : ''}`
      : null;
    const showThumbnailImage = !!thumbnailSrc && !hasThumbnailLoadError;

    return (
      <div className="h-24 w-36 rounded border overflow-hidden bg-muted relative flex items-center justify-center">
        {showThumbnailImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnailSrc}
            alt=""
            className="h-full w-full object-cover"
            onLoad={() => handleBunnyThumbnailLoad(asset.id)}
            onError={() => handleBunnyThumbnailError(asset.id)}
          />
        ) : isReadyToPlay ? (
          <div className="h-full w-full bg-black/60 flex flex-col items-center justify-center gap-1">
            <Play className="h-4 w-4 text-emerald-300" />
            <span className="text-[10px] text-emerald-100 font-medium">再生できます</span>
          </div>
        ) : (
          <FileVideo className="h-6 w-6 text-muted-foreground" />
        )}
        {isProcessing && !isReadyToPlay && (
          <div className="absolute inset-0 bg-black/65 flex flex-col items-center justify-center gap-1">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
            <span className="text-[10px] text-white/90 font-medium">処理中...</span>
          </div>
        )}
      </div>
    );
  };

  const handleOpenAsset = (asset: VideoAsset) => {
    if (asset.kind === 'IMAGE') {
      if (!asset.sourceUrl) {
        toast.error('このアセットはプレビューを表示できません');
        return;
      }
      setPreviewImage(asset.sourceUrl);
      setPreviewImageTitle(asset.displayName);
      return;
    }
    if (asset.kind === 'AUDIO') {
      setSelectedAsset(asset);
      return;
    }
    if (asset.kind === 'LINK') {
      setSelectedAsset(asset);
      return;
    }
    if (asset.provider === 'BUNNY' && !bunnyReadyByAssetId[asset.id]) {
      setBunnyProcessingByAssetId((prev) =>
        prev[asset.id] ? prev : { ...prev, [asset.id]: true }
      );
    }
    setSelectedAsset(asset);
  };

  const selectedBunnyAssetId = selectedAsset?.provider === 'BUNNY' ? selectedAsset.id : null;
  const isSelectedBunnyProcessing = selectedBunnyAssetId
    ? !!bunnyProcessingByAssetId[selectedBunnyAssetId] && !bunnyReadyByAssetId[selectedBunnyAssetId]
    : false;

  return (
    <div
      className="space-y-4"
      onPaste={handleImagePaste}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">アセット</span>
          <Badge variant="secondary">{assets.length}</Badge>
        </div>
      </div>

      {canUploadAssets ? (
        <div
          className={cn(
            'rounded-lg border p-3 space-y-3 relative transition-colors',
            isDragOver && 'border-primary bg-primary/5'
          )}
        >
          {isDragOver && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-primary/10 border-2 border-dashed border-primary pointer-events-none">
              <UploadCloud className="h-8 w-8 text-primary" />
              <span className="text-sm font-medium text-primary">ファイルをドロップしてアップロード</span>
              <span className="text-xs text-primary/80">
                複数の画像・動画・音声に対応しています
              </span>
            </div>
          )}
          <Tabs
            value={uploadTab}
            onValueChange={(value) =>
              setUploadTab(value as 'image' | 'youtube' | 'bunny' | 'voice' | 'link')
            }
          >
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="image">画像</TabsTrigger>
              <TabsTrigger value="youtube">YouTube</TabsTrigger>
              <TabsTrigger value="bunny">動画</TabsTrigger>
              <TabsTrigger value="voice">音声</TabsTrigger>
              <TabsTrigger value="link">リンク</TabsTrigger>
            </TabsList>
          </Tabs>

          {uploadTab === 'image' && (
            <div className="space-y-2">
              <Input
                placeholder="メンション・タグ付け用の名前（任意）"
                value={imageTitle}
                onChange={(event) => setImageTitle(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                設定すると、@asset メンションでこの名前が使われます。
              </p>
              <p className="text-xs text-muted-foreground">
                ヒント: Ctrl/Cmd+V で画像を貼り付けるか、複数のファイルをこのパネルにドロップできます。
              </p>
              {pendingImageFiles.length > 0 ? (
                <div className="space-y-1">
                  {pendingImageFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      className="rounded-md border px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="truncate">添付済み: {file.name}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => {
                          setPendingImageFiles((prev) => prev.filter((_, i) => i !== index));
                        }}
                      >
                        削除
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setPendingImageFiles([]);
                      if (imageInputRef.current) imageInputRef.current.value = '';
                    }}
                  >
                    すべてクリア
                  </Button>
                </div>
              ) : null}
              <Button
                variant="outline"
                className="w-full"
                disabled={isUploadingImage || isCreatingAsset}
                onClick={() => {
                  if (pendingImageFiles.length > 0) {
                    void handleImageUpload(pendingImageFiles);
                    return;
                  }
                  imageInputRef.current?.click();
                }}
              >
                {isUploadingImage || isCreatingAsset ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4 mr-2" />
                )}
                {isUploadingImage
                  ? 'アップロード中...'
                  : isCreatingAsset
                    ? '保存中...'
                    : pendingImageFiles.length > 1
                      ? `${pendingImageFiles.length}件の画像をアップロード`
                      : pendingImageFiles.length === 1
                        ? '画像をアップロード'
                        : '画像を選択'}
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageFileChange}
              />
            </div>
          )}

          {uploadTab === 'youtube' && (
            <div className="space-y-2">
              <Input
                placeholder="https://youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
              />
              <Input
                placeholder="表示名（任意）"
                value={youtubeTitle}
                onChange={(event) => setYoutubeTitle(event.target.value)}
              />
              <Button
                className="w-full"
                disabled={isCreatingAsset || !youtubeUrl.trim()}
                onClick={handleCreateYoutubeAsset}
              >
                <Youtube className="h-4 w-4 mr-2" />
                YouTubeアセットを追加
              </Button>
            </div>
          )}

          {uploadTab === 'link' && (
            <div className="space-y-2">
              <Input
                placeholder="表示名（例: 台本ドキュメント）"
                value={linkTitle}
                onChange={(event) => setLinkTitle(event.target.value)}
              />
              <Input
                placeholder="https://drive.google.com/..."
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Google ドライブなど外部サービスのURLを素材として共有できます。リンクは新しいタブで開きます。
              </p>
              <Button
                className="w-full"
                disabled={isCreatingAsset || !linkUrl.trim() || !linkTitle.trim()}
                onClick={handleCreateLinkAsset}
              >
                <Link2 className="h-4 w-4 mr-2" />
                リンクを追加
              </Button>
            </div>
          )}

          {uploadTab === 'bunny' && (
            <div className="space-y-2">
              <Input
                placeholder="メンション・タグ付け用の名前（任意）"
                value={bunnyTitle}
                onChange={(event) => setBunnyTitle(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                設定すると、@asset メンションでこの名前が使われます。
              </p>
              <p className="text-xs text-muted-foreground">
                複数の動画ファイルをこのパネルにドロップすると、順番にアップロードします。
              </p>
              <Button
                variant="outline"
                className="w-full"
                disabled={isUploadingBunny || isCreatingAsset}
                onClick={() => bunnyInputRef.current?.click()}
              >
                {isUploadingBunny ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4 mr-2" />
                )}
                {isUploadingBunny ? 'アップロード中...' : '動画を選択'}
              </Button>
              <input
                ref={bunnyInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={handleBunnyUpload}
              />
              {isUploadingBunny && (
                <div className="space-y-1">
                  {bunnyUploadLabel ? (
                    <p className="text-xs text-muted-foreground">{bunnyUploadLabel}</p>
                  ) : null}
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${bunnyProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadTab === 'voice' && (
            <div className="space-y-2">
              <Input
                placeholder="この録音の名前（任意）"
                value={voiceTitle}
                onChange={(e) => setVoiceTitle(e.target.value)}
                disabled={isRecording || isUploadingVoice}
              />
              {pendingAudioFiles.length > 0 ? (
                <div className="space-y-2">
                  {pendingAudioFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      className="rounded-md border px-2 py-1.5 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="truncate">添付済み: {file.name}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => {
                          setPendingAudioFiles((prev) => prev.filter((_, i) => i !== index));
                        }}
                      >
                        削除
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setPendingAudioFiles([]);
                      if (voiceInputRef.current) voiceInputRef.current.value = '';
                    }}
                  >
                    すべてクリア
                  </Button>
                  <Button
                    className="w-full"
                    disabled={isUploadingVoice || isCreatingAsset}
                    onClick={() => void handleVoiceUpload()}
                  >
                    {isUploadingVoice ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UploadCloud className="h-4 w-4 mr-2" />
                    )}
                    {isUploadingVoice
                      ? 'アップロード中...'
                      : pendingAudioFiles.length > 1
                        ? `${pendingAudioFiles.length}件のファイルをアップロード`
                        : 'ファイルをアップロード'}
                  </Button>
                </div>
              ) : isRecording ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                    </span>
                    <span className="text-red-500 font-medium">録音中</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {String(Math.floor(recordingTime / 60)).padStart(2, '0')}:
                      {String(recordingTime % 60).padStart(2, '0')}
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9 shrink-0"
                    title="録音を停止"
                    onClick={stopRecording}
                  >
                    <Square className="h-3.5 w-3.5 fill-current" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 shrink-0"
                    title="録音をキャンセル"
                    onClick={cancelRecording}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : audioBlob ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 bg-muted rounded">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() =>
                        audioBlobUrl && playVoice('recording-preview', audioBlobUrl, recordingTime)
                      }
                    >
                      {playingVoiceId === 'recording-preview' ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <div className="flex-1 h-2 bg-primary/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{
                          width:
                            playingVoiceId === 'recording-preview' ? `${voiceProgress}%` : '0%',
                        }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {playingVoiceId === 'recording-preview'
                        ? `${formatTime(voiceCurrentTime)} / ${formatTime(recordingTime)}`
                        : formatTime(recordingTime)}
                    </span>
                    {playingVoiceId === 'recording-preview' && (
                      <button
                        onClick={toggleVoiceSpeed}
                        className="text-[10px] font-bold px-1 py-0.5 rounded bg-muted hover:bg-muted-foreground/20 tabular-nums shrink-0"
                      >
                        {voicePlaybackRate}x
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={isUploadingVoice || isCreatingAsset}
                      onClick={handleVoiceUpload}
                    >
                      {isUploadingVoice ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4 mr-2" />
                      )}
                      {isUploadingVoice ? 'アップロード中...' : '録音をアップロード'}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      title="破棄して録り直す"
                      onClick={cancelRecording}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={startRecording}
                    disabled={isUploadingVoice || isCreatingAsset}
                  >
                    <Mic className="h-4 w-4 mr-2" />
                    録音を開始
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={isUploadingVoice || isCreatingAsset}
                    onClick={() => voiceInputRef.current?.click()}
                  >
                    <UploadCloud className="h-4 w-4 mr-2" />
                    音声ファイルを選択
                  </Button>
                  <input
                    ref={voiceInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    className="hidden"
                    onChange={handleVoiceFileChange}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                または、複数の音声ファイルをこのパネルのどこかにドラッグしてください。
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border p-3 text-xs text-muted-foreground">
          アセットをアップロードする権限がありません。
        </div>
      )}

      <AssetListSection
        assets={sortedAssets}
        isLoadingAssets={isLoadingAssets}
        focusedAssetId={focusedAssetId}
        bunnyProcessingByAssetId={bunnyProcessingByAssetId}
        bunnyReadyByAssetId={bunnyReadyByAssetId}
        activeDownloadAssetId={activeDownloadAssetId}
        deletingAssetIds={deletingAssetIds}
        canDownloadAssets={canDownloadAssets}
        hasMoreAssets={hasMoreAssets}
        isLoadingMoreAssets={isLoadingMoreAssets}
        onViewAsset={handleOpenAsset}
        onDownloadAsset={(asset, preference) => void downloadAsset(asset, preference)}
        onDeleteAsset={(assetId) => void deleteAsset(assetId)}
        onLoadMoreAssets={() => void loadMoreAssets()}
        renderAssetPreview={renderAssetPreview}
      />

      <ImagePreviewDialog
        previewImage={previewImage}
        title={previewImageTitle}
        downloadFileName={previewImageTitle}
        canDownload={canDownloadAssets}
        onClose={() => {
          setPreviewImage(null);
          setPreviewImageTitle(null);
        }}
      />

      <Dialog
        open={selectedAsset?.kind === 'AUDIO'}
        onOpenChange={(open) => {
          if (!open) {
            stopVoice();
            setSelectedAsset(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle>{selectedAsset?.displayName || '音声録音'}</DialogTitle>
          {selectedAsset?.sourceUrl ? (
            <div className="flex items-center gap-2 p-2 bg-muted rounded">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 shrink-0"
                onClick={() =>
                  selectedAsset.sourceUrl && playVoice(selectedAsset.id, selectedAsset.sourceUrl)
                }
              >
                {playingVoiceId === selectedAsset?.id ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>
              <div className="flex-1 h-2 bg-primary/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full"
                  style={{
                    width: playingVoiceId === selectedAsset?.id ? `${voiceProgress}%` : '0%',
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                {playingVoiceId === selectedAsset?.id ? formatTime(voiceCurrentTime) : '00:00'}
              </span>
              {playingVoiceId === selectedAsset?.id && (
                <button
                  onClick={toggleVoiceSpeed}
                  className="text-[10px] font-bold px-1 py-0.5 rounded bg-muted hover:bg-muted-foreground/20 tabular-nums shrink-0"
                >
                  {voicePlaybackRate}x
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">音声プレビューを表示できません。</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedAsset?.kind === 'LINK'}
        onOpenChange={(open) => !open && setSelectedAsset(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle>{selectedAsset?.displayName || '外部リンク'}</DialogTitle>
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md border bg-muted p-3">
              <Link2 className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">外部リンク素材</p>
                <p className="text-xs text-muted-foreground truncate">
                  {getLinkHostname(selectedAsset?.sourceUrl ?? null) ||
                    selectedAsset?.sourceUrl ||
                    ''}
                </p>
              </div>
            </div>
            {selectedAsset?.sourceUrl ? (
              <Button
                className="w-full"
                onClick={() => {
                  if (selectedAsset?.sourceUrl) {
                    window.open(selectedAsset.sourceUrl, '_blank', 'noopener');
                  }
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                開く
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">リンクURLを取得できませんでした。</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectedAsset?.kind === 'VIDEO'}
        onOpenChange={(open) => !open && setSelectedAsset(null)}
      >
        <DialogContent
          showCloseButton={false}
          className="max-w-none sm:max-w-none w-screen h-screen max-h-screen p-0 overflow-hidden bg-black/90 border-none shadow-none rounded-none flex items-center justify-center"
          onClick={() => setSelectedAsset(null)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              setSelectedAsset(null);
            }
          }}
        >
          <DialogTitle className="sr-only">
            {selectedAsset?.displayName || '動画プレビュー'}
          </DialogTitle>

          <div
            className="w-[min(96vw,1500px)] h-[min(94vh,1000px)] border border-border/60 bg-black/80 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center gap-2 border-b border-border/60 bg-background/85 px-2 py-1.5 backdrop-blur-sm">
              <p
                className="flex-1 min-w-0 text-sm text-foreground truncate"
                title={selectedAsset?.displayName || undefined}
              >
                {selectedAsset?.displayName || '動画プレビュー'}
              </p>
              {selectedAsset?.provider === 'YOUTUBE' && selectedAsset.providerVideoId ? (
                <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
                  <a
                    href={`https://www.youtube.com/watch?v=${selectedAsset.providerVideoId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    YouTubeで開く
                  </a>
                </Button>
              ) : selectedAsset?.provider === 'R2_VIDEO' && canDownloadAssets ? (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="動画をダウンロード"
                  aria-label="動画をダウンロード"
                  disabled={activeDownloadAssetId === selectedAsset.id}
                  onClick={() => void downloadAsset(selectedAsset)}
                >
                  {activeDownloadAssetId === selectedAsset.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              ) : null}
              {selectedAsset?.provider === 'BUNNY' && canDownloadAssets ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      title="動画をダウンロード"
                      aria-label="動画をダウンロード"
                      disabled={
                        activeDownloadAssetId === selectedAsset.id || isSelectedBunnyProcessing
                      }
                    >
                      {activeDownloadAssetId === selectedAsset.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => void downloadAsset(selectedAsset, 'original')}>
                      <Download className="h-3 w-3 mr-2" />
                      オリジナル
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => void downloadAsset(selectedAsset, 'compressed')}
                    >
                      <Download className="h-3 w-3 mr-2" />
                      圧縮版
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setSelectedAsset(null)}
              >
                <span className="sr-only">閉じる</span>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 min-h-0 w-full p-2 sm:p-4">
              {selectedAsset ? (
                selectedAsset.provider === 'YOUTUBE' && selectedAsset.providerVideoId ? (
                  <div className="w-full h-full rounded-md border overflow-hidden bg-black">
                    <iframe
                      ref={youtubeIframeRef}
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${selectedAsset.providerVideoId}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1${typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : ''}`}
                      title={selectedAsset.displayName}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                ) : selectedAsset.provider === 'R2_VIDEO' && selectedAsset.sourceUrl ? (
                  <video
                    className="w-full h-full rounded-md border bg-black object-contain"
                    src={selectedAsset.sourceUrl}
                    controls
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <BunnyPreviewPlayer
                    ref={bunnyPreviewPlayerRef}
                    providerVideoId={selectedAsset.providerVideoId}
                    isProcessing={isSelectedBunnyProcessing}
                    onReadyToPlay={() => {
                      if (!selectedBunnyAssetId) return;
                      setBunnyReadyByAssetId((prev) => ({ ...prev, [selectedBunnyAssetId]: true }));
                      setBunnyProcessingByAssetId((prev) => ({
                        ...prev,
                        [selectedBunnyAssetId]: false,
                      }));
                    }}
                  />
                )
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
