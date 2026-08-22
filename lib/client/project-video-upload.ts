'use client';

import { resolvePublicBunnyCdnHostname } from '@/lib/bunny-cdn';
import { cleanupPendingR2VideoUpload, uploadVideoToR2 } from '@/lib/client/r2-video-upload';
import type { DirectUploadProvider } from '@/components/video-page/types';
import { apiRequestError } from '@/lib/client/api-error';

export const VIDEO_FILE_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'mkv'];

/** 音声(Podcast)レビュー対応。R2(S3)直接アップロード経路のみ許可(Bunny は動画専用)。 */
export const AUDIO_FILE_EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'];

export type ActiveTusUpload = { abort: (shouldTerminate?: boolean) => Promise<unknown> | void };

export type PendingProjectUploadCleanup =
  | { type: 'bunny'; videoId: string; uploadToken: string }
  | {
      type: 'r2';
      objectKey: string;
      uploadToken: string;
      reservationId: string | null;
      thumbnailObjectKey?: string;
    };

export type ProjectVideoUploadProgress = {
  onProgress?: (progress: number) => void;
  onStatus?: (status: string) => void;
  onTusUploadReady?: (upload: ActiveTusUpload) => void;
  onPendingUpload?: (pending: PendingProjectUploadCleanup) => void;
  isCancelled?: () => boolean;
};

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return !!ext && VIDEO_FILE_EXTENSIONS.includes(ext);
}

export function isAudioFile(file: File): boolean {
  if (file.type.startsWith('audio/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return !!ext && AUDIO_FILE_EXTENSIONS.includes(ext);
}

/**
 * レビュー対象としてアップロード可能なメディアか。音声を許可するのは R2(S3)
 * 直接アップロード経路のみで、Bunny 経路は動画専用のまま。
 */
export function isUploadableMediaFile(file: File, provider: DirectUploadProvider): boolean {
  if (isVideoFile(file)) return true;
  return provider === 'r2' && isAudioFile(file);
}

/** ファイル選択 input の accept 属性。R2 のときだけ音声も受け付ける。 */
export function uploadAcceptForProvider(provider: DirectUploadProvider): string {
  return provider === 'r2' ? 'video/*,audio/*' : 'video/*';
}

export function extractVideoFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer?.files?.length) return [];
  return Array.from(dataTransfer.files).filter(isVideoFile);
}

export function getDefaultTitleFromFile(file: File): string {
  const withoutExt = file.name.replace(/\.[^/.]+$/, '').trim();
  return withoutExt || file.name;
}

export async function cleanupPendingProjectUpload(
  projectId: string,
  pending: PendingProjectUploadCleanup,
  keepalive = false
): Promise<void> {
  try {
    if (pending.type === 'bunny') {
      await fetch(`/api/projects/${projectId}/videos/bunny-init`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: pending.videoId, uploadToken: pending.uploadToken }),
        keepalive,
      });
    } else {
      await cleanupPendingR2VideoUpload(
        projectId,
        {
          objectKey: pending.objectKey,
          uploadToken: pending.uploadToken,
          reservationId: pending.reservationId,
          thumbnailObjectKey: pending.thumbnailObjectKey,
        },
        keepalive
      );
    }
  } catch (error) {
    console.error('Failed to cleanup pending project upload:', error);
  }
}

export async function uploadProjectVideo(
  projectId: string,
  file: File,
  options: {
    provider: DirectUploadProvider;
    title?: string;
    description?: string | null;
    bunnyCdnHostname?: string | null;
  } & ProjectVideoUploadProgress
): Promise<void> {
  const {
    provider,
    title: titleOverride,
    description = null,
    bunnyCdnHostname = resolvePublicBunnyCdnHostname(),
    onProgress,
    onStatus,
    onTusUploadReady,
    onPendingUpload,
    isCancelled,
  } = options;

  const title = titleOverride?.trim() || getDefaultTitleFromFile(file);
  let pendingCleanup: PendingProjectUploadCleanup | null = null;

  try {
    if (provider === 'r2') {
      onStatus?.('Initializing upload...');
      const uploaded = await uploadVideoToR2(projectId, file, {
        onProgress: (progress) => {
          onProgress?.(progress);
          onStatus?.(`Uploading... ${progress}%`);
        },
      });

      pendingCleanup = {
        type: 'r2',
        objectKey: uploaded.objectKey,
        uploadToken: uploaded.uploadToken,
        reservationId: uploaded.reservationId,
        thumbnailObjectKey: uploaded.thumbnailObjectKey,
      };
      onPendingUpload?.(pendingCleanup);

      if (isCancelled?.()) {
        throw new Error('Upload cancelled');
      }

      onStatus?.('Saving video...');
      const createResponse = await fetch(`/api/projects/${projectId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          videoUrl: uploaded.proxyUrl,
          providerId: 'r2',
          videoId: uploaded.objectKey,
          thumbnailUrl: uploaded.thumbnailUrl || '/placeholder-video-thumbnail.png',
          duration: uploaded.duration,
          uploadToken: uploaded.uploadToken,
          objectKey: uploaded.objectKey,
          reservationId: uploaded.reservationId,
        }),
      });

      const createPayload = (await createResponse.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!createResponse.ok) {
        throw apiRequestError(createPayload, 'Failed to create video');
      }

      pendingCleanup = null;
      return;
    }

    onStatus?.('Initializing upload...');
    const initResponse = await fetch(`/api/projects/${projectId}/videos/bunny-init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The server checks this against the quota and holds a reservation for it,
      // so an upload that cannot fit is turned away before any of it is sent.
      body: JSON.stringify({ title, sizeBytes: file.size.toString() }),
    });

    const initPayload = (await initResponse.json().catch(() => null)) as {
      data?: {
        videoId: string;
        libraryId: string;
        signature: string;
        expirationTime: number;
        uploadToken: string;
      };
      error?: string;
    } | null;

    if (!initResponse.ok || !initPayload?.data) {
      throw apiRequestError(initPayload, 'Failed to initialize upload');
    }

    const { videoId, libraryId, signature, expirationTime, uploadToken } = initPayload.data;
    pendingCleanup = { type: 'bunny', videoId, uploadToken };
    onPendingUpload?.(pendingCleanup);

    if (isCancelled?.()) {
      throw new Error('Upload cancelled');
    }

    const { Upload } = await import('tus-js-client');
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(file, {
        endpoint: 'https://video.bunnycdn.com/tusupload',
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          AuthorizationSignature: signature,
          AuthorizationExpire: expirationTime.toString(),
          VideoId: videoId,
          LibraryId: libraryId,
        },
        metadata: {
          filetype: file.type,
          title,
        },
        onError: (error) => {
          onTusUploadReady?.({ abort: () => undefined });
          reject(new Error(error.message));
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percentage = Number(((bytesUploaded / bytesTotal) * 100).toFixed(1));
          onProgress?.(percentage);
          onStatus?.(`Uploading... ${percentage}%`);
        },
        onSuccess: () => {
          onTusUploadReady?.({ abort: () => undefined });
          resolve();
        },
      });

      onTusUploadReady?.(upload);
      upload.start();
    });

    if (isCancelled?.()) {
      throw new Error('Upload cancelled');
    }

    onStatus?.('Saving video...');
    const createResponse = await fetch(`/api/projects/${projectId}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        videoUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`,
        providerId: 'bunny',
        videoId,
        thumbnailUrl: bunnyCdnHostname
          ? `https://${bunnyCdnHostname}/${videoId}/thumbnail.jpg`
          : null,
        duration: null,
        uploadToken,
      }),
    });

    const createPayload = (await createResponse.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!createResponse.ok) {
      throw apiRequestError(createPayload, 'Failed to create video');
    }

    pendingCleanup = null;
  } catch (error) {
    if (pendingCleanup) {
      await cleanupPendingProjectUpload(projectId, pendingCleanup);
    }
    throw error;
  }
}
