const VIDEO_MIME_TO_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/ogg': 'ogg',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi',
};

const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
};

const ALLOWED_VIDEO_EXTENSIONS = new Set(Object.keys(EXT_TO_MIME));

export function normalizeVideoMime(mime: string | undefined): string | null {
  if (!mime) return null;
  const normalized = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!normalized.startsWith('video/')) return null;
  return normalized;
}

export function getVideoExtensionFromMime(mime: string): string | null {
  return VIDEO_MIME_TO_EXT[mime] ?? null;
}

export function getVideoExtensionFromFileName(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED_VIDEO_EXTENSIONS.has(ext)) return null;
  return ext;
}

/**
 * The file name decides, always. A declared MIME type is a client claim, so trusting it
 * on its own let `payload.exe` through as long as it said `video/mp4`. The declared type
 * is only consulted to pick between two types that share an extension.
 */
export function resolveVideoContentType(fileName: string, mime: string | undefined): string | null {
  const ext = getVideoExtensionFromFileName(fileName);
  if (!ext) return null;

  const typeFromName = EXT_TO_MIME[ext];
  if (!typeFromName) return null;

  const normalizedMime = normalizeVideoMime(mime);
  if (normalizedMime && getVideoExtensionFromMime(normalizedMime) === ext) {
    return normalizedMime;
  }

  return typeFromName;
}

export function isAllowedVideoFile(fileName: string, mime: string | undefined): boolean {
  return resolveVideoContentType(fileName, mime) !== null;
}

// --- 音声(Podcast)レビュー対応 ---
// R2(S3)直接アップロード経路のみ音声ファイルもレビュー対象として許可する。
// Bunny 経路は動画専用のままなので、既存の resolveVideoContentType 系は変更しない。

const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/aac': 'aac',
  'audio/x-aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

const AUDIO_EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
};

/**
 * 拡張子だけで「音声のみ」と断定できるもの。`.ogg` は動画・音声の両方があり得るため
 * 含めない(従来どおり動画として扱われても HTML5 video 要素で再生できる)。
 */
const AUDIO_ONLY_EXTENSIONS = new Set(['mp3', 'm4a', 'wav', 'aac', 'flac']);

export function normalizeAudioMime(mime: string | undefined): string | null {
  if (!mime) return null;
  const normalized = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!normalized.startsWith('audio/')) return null;
  return normalized;
}

export function getAudioExtensionFromMime(mime: string): string | null {
  return AUDIO_MIME_TO_EXT[mime] ?? null;
}

/**
 * resolveVideoContentType の動画+音声版(R2 直接アップロード経路専用)。
 * 原則は同じ: ファイル名(拡張子)が常に決定し、申告 MIME は同じ拡張子を共有する
 * 型の間の選択にだけ使う。`.ogg` は申告が audio/ogg のときのみ音声として扱う。
 */
export function resolveMediaContentType(fileName: string, mime: string | undefined): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const normalizedAudio = normalizeAudioMime(mime);

  const videoType = resolveVideoContentType(fileName, mime);
  if (videoType) {
    if (normalizedAudio && getAudioExtensionFromMime(normalizedAudio) === ext) {
      return normalizedAudio;
    }
    return videoType;
  }

  const audioTypeFromName = AUDIO_EXT_TO_MIME[ext];
  if (!audioTypeFromName) return null;

  if (normalizedAudio && getAudioExtensionFromMime(normalizedAudio) === ext) {
    return normalizedAudio;
  }
  return audioTypeFromName;
}

export function getMediaExtensionFromMime(mime: string): string | null {
  return getVideoExtensionFromMime(mime) ?? getAudioExtensionFromMime(mime);
}

/**
 * objectKey / 再生 URL の拡張子から「音声のみ」のメディアかどうかを判定する。
 * プレーヤーの音声オーバーレイ表示用。`.ogg` は動画の可能性があるため音声扱いしない
 * (誤検出でオーバーレイを出すより、出さない側に倒す)。
 */
export function isAudioOnlyMediaPath(pathOrUrl: string): boolean {
  const withoutQuery = pathOrUrl.split(/[?#]/)[0] ?? '';
  const ext = withoutQuery.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_ONLY_EXTENSIONS.has(ext);
}

export const VIDEO_OBJECT_KEY_PREFIX = 'videos/';
export const VIDEO_PROXY_PREFIX = '/api/upload/video/';

const SAFE_VIDEO_BASENAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

export function buildVideoObjectKey(filename: string): string {
  return `${VIDEO_OBJECT_KEY_PREFIX}${filename}`;
}

export function videoProxyPathFromFilename(filename: string): string {
  return `${VIDEO_PROXY_PREFIX}${filename}`;
}

export function videoProxyPathToObjectKey(proxyPath: string): string | null {
  if (!proxyPath.startsWith(VIDEO_PROXY_PREFIX)) return null;
  const filename = proxyPath.slice(VIDEO_PROXY_PREFIX.length);
  if (!SAFE_VIDEO_BASENAME.test(filename)) return null;
  return buildVideoObjectKey(filename);
}

/**
 * Playback URL for a direct-upload (`r2`) version: media always streams through
 * the app's own upload route. Shared by the video page and the compare view so
 * the two cannot drift.
 */
export function resolveR2PlaybackUrl(version: { videoId: string; originalUrl: string }): string {
  if (version.originalUrl.startsWith(VIDEO_PROXY_PREFIX)) {
    return version.originalUrl;
  }
  if (version.originalUrl.startsWith(VIDEO_OBJECT_KEY_PREFIX)) {
    return videoProxyPathFromFilename(version.originalUrl.slice(VIDEO_OBJECT_KEY_PREFIX.length));
  }
  if (version.videoId.startsWith(VIDEO_OBJECT_KEY_PREFIX)) {
    return videoProxyPathFromFilename(version.videoId.slice(VIDEO_OBJECT_KEY_PREFIX.length));
  }
  return version.originalUrl;
}

/**
 * Guards what ends up in a `<video src>`: proxy paths must be a well-formed
 * upload route, anything else must be plain http(s).
 */
export function isPlayableVideoUrl(url: string): boolean {
  if (url.startsWith(VIDEO_PROXY_PREFIX)) {
    return videoProxyPathToObjectKey(url) !== null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function objectKeyToVideoProxyPath(objectKey: string): string | null {
  if (!objectKey.startsWith(VIDEO_OBJECT_KEY_PREFIX)) return null;
  const filename = objectKey.slice(VIDEO_OBJECT_KEY_PREFIX.length);
  if (!SAFE_VIDEO_BASENAME.test(filename)) return null;
  return videoProxyPathFromFilename(filename);
}

export { SAFE_VIDEO_BASENAME };
