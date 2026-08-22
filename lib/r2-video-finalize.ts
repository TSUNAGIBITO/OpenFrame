import { db } from '@/lib/db';
import { getConfiguredMaxVideoUploadBytes } from '@/lib/feature-flags';
import {
  deleteR2Object,
  deleteVideoObject,
  headR2Object,
  headVideoObject,
  readVideoObjectBytes,
} from '@/lib/r2';
import { parseR2UploadToken, verifyR2UploadToken } from '@/lib/r2-upload-token';
import {
  objectKeyToVideoProxyPath,
  videoProxyPathToObjectKey,
} from '@/lib/video-upload-validation';

export type R2VideoFinalizeInput = {
  userId: string;
  projectId: string;
  videoUrl: string;
  objectKey: string;
  uploadToken: string;
};

export type R2VideoFinalizeResult =
  | {
      ok: true;
      sizeBytes: bigint;
      proxyUrl: string;
      objectKey: string;
      sessionId: string;
      reservationId: string | null;
      billedUserId: string;
      thumbnailObjectKey: string;
      thumbnailProxyUrl: string;
    }
  | { ok: false; error: string; status: 400 | 403 };

function hasKnownVideoMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length >= 12) {
    const box = String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);
    if (box === 'ftyp') return true;
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return true;
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return true;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x41 &&
    bytes[9] === 0x56 &&
    bytes[10] === 0x49 &&
    bytes[11] === 0x20
  ) {
    return true;
  }
  return false;
}

/**
 * 音声(Podcast)アップロードの objectKey 拡張子。`.ogg` は動画側の magic bytes
 * (OggS) で既に通るため、ここには「音声のみ」の拡張子だけを載せる。
 */
const AUDIO_OBJECT_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'aac', 'flac']);

function objectKeyExtension(objectKey: string): string {
  return objectKey.split('.').pop()?.toLowerCase() ?? '';
}

function hasKnownAudioMagicBytes(bytes: Uint8Array): boolean {
  // ID3 タグ (mp3)
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  // MPEG audio / ADTS AAC のフレーム同期 (0xFF 0xEx-0xFx)
  if (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) {
    return true;
  }
  // ftyp ボックス (m4a)
  if (bytes.length >= 12) {
    const box = String.fromCharCode(bytes[4] ?? 0, bytes[5] ?? 0, bytes[6] ?? 0, bytes[7] ?? 0);
    if (box === 'ftyp') return true;
  }
  // fLaC
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return true;
  }
  // RIFF....WAVE (wav)
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return true;
  }
  // OggS (ogg)
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return true;
  }
  return false;
}

export async function finalizeR2VideoUpload(
  input: R2VideoFinalizeInput
): Promise<R2VideoFinalizeResult> {
  const { userId, projectId, videoUrl, objectKey, uploadToken } = input;

  if (!objectKey || !uploadToken) {
    return { ok: false, error: 'R2 uploads must include objectKey and uploadToken', status: 400 };
  }

  const expectedProxyUrl = objectKeyToVideoProxyPath(objectKey);
  if (!expectedProxyUrl) {
    return { ok: false, error: 'Invalid object key', status: 400 };
  }

  if (videoUrl !== expectedProxyUrl) {
    return { ok: false, error: 'Video URL does not match the uploaded object', status: 400 };
  }

  const keyFromUrl = videoProxyPathToObjectKey(videoUrl);
  if (!keyFromUrl || keyFromUrl !== objectKey) {
    return { ok: false, error: 'Video URL does not match the uploaded object', status: 400 };
  }

  const tokenPayload = parseR2UploadToken(uploadToken);
  if (!tokenPayload) {
    return { ok: false, error: 'Invalid upload token', status: 403 };
  }

  const isValidUploadToken = verifyR2UploadToken(uploadToken, {
    userId,
    projectId,
    objectKey,
    sessionId: tokenPayload.sid,
    tokenId: tokenPayload.jti,
  });
  if (!isValidUploadToken) {
    return { ok: false, error: 'Invalid upload token', status: 403 };
  }

  const uploadSession = await db.videoUploadSession.findFirst({
    where: {
      id: tokenPayload.sid,
      uploadJti: tokenPayload.jti,
      status: 'INITIATED',
      userId,
      projectId,
      objectKey,
      thumbnailObjectKey: tokenPayload.tkey,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      billedUserId: true,
      reservationId: true,
      declaredSizeBytes: true,
      thumbnailObjectKey: true,
    },
  });
  if (!uploadSession) {
    return { ok: false, error: 'Invalid upload token', status: 403 };
  }

  const thumbnailFilename = uploadSession.thumbnailObjectKey.startsWith('images/')
    ? uploadSession.thumbnailObjectKey.slice('images/'.length)
    : '';
  if (!thumbnailFilename) {
    return { ok: false, error: 'Invalid upload token', status: 403 };
  }

  const cancelPendingUpload = async (error: string): Promise<R2VideoFinalizeResult> => {
    await db.videoUploadSession.updateMany({
      where: { id: uploadSession.id, status: 'INITIATED' },
      data: { status: 'CANCELLED', consumedAt: new Date() },
    });
    await Promise.all([
      deleteVideoObject(objectKey).catch(() => undefined),
      deleteR2Object(uploadSession.thumbnailObjectKey).catch(() => undefined),
    ]);
    return { ok: false, error, status: 400 };
  };

  const head = await headVideoObject(objectKey);
  if (!head || head.contentLength <= BigInt(0)) {
    return cancelPendingUpload('Uploaded video was not found in storage');
  }

  // Only the host's absolute cap is re-checked here. The account's own ceiling
  // was applied when the upload was initiated, and re-deriving it now would
  // delete a finished upload over a plan that lapsed while the bytes were in
  // flight. Anything larger than what was declared is caught on the next line.
  const hostCeiling = getConfiguredMaxVideoUploadBytes();
  if (hostCeiling !== null && head.contentLength > hostCeiling) {
    return cancelPendingUpload('Uploaded video exceeds the maximum allowed upload size');
  }

  if (head.contentLength > uploadSession.declaredSizeBytes) {
    return cancelPendingUpload('Uploaded video size does not match upload request');
  }

  // 拡張子が音声のみのアップロードは音声側の magic bytes で検証する。
  // (音声を許可するのは R2 直接アップロード経路のみ。動画側の判定は従来のまま。)
  const isAudioObject = AUDIO_OBJECT_EXTENSIONS.has(objectKeyExtension(objectKey));
  const headerBytes = await readVideoObjectBytes(objectKey, 64);
  const hasKnownMagicBytes =
    !!headerBytes &&
    (isAudioObject ? hasKnownAudioMagicBytes(headerBytes) : hasKnownVideoMagicBytes(headerBytes));
  if (!hasKnownMagicBytes) {
    return cancelPendingUpload(
      isAudioObject ? 'Uploaded file is not a valid audio file' : 'Uploaded file is not a valid video'
    );
  }

  // 音声にはサムネイルが無い(クライアントの captureVideoThumbnail が null を返し、
  // サムネイルはアップロードされない)。存在しないオブジェクトを指す URL を DB に
  // 保存しないよう、実体を確認できない場合はプレースホルダーへフォールバックする。
  const thumbnailHead = await headR2Object(uploadSession.thumbnailObjectKey).catch(() => null);
  const thumbnailProxyUrl =
    thumbnailHead && thumbnailHead.contentLength > BigInt(0)
      ? `/api/upload/image/${thumbnailFilename}`
      : '/placeholder-video-thumbnail.png';

  return {
    ok: true,
    sizeBytes: head.contentLength,
    proxyUrl: expectedProxyUrl,
    objectKey,
    sessionId: uploadSession.id,
    reservationId: uploadSession.reservationId,
    billedUserId: uploadSession.billedUserId,
    thumbnailObjectKey: uploadSession.thumbnailObjectKey,
    thumbnailProxyUrl,
  };
}
