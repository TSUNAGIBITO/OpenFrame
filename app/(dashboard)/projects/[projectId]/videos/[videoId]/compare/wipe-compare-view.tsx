'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { resolvePublicBunnyCdnHostname } from '@/lib/bunny-cdn';
import { isPlayableVideoUrl, resolveR2PlaybackUrl } from '@/lib/video-upload-validation';

// ワイプ比較で扱えるバージョンの最小限の形。親の Version 型はこれを構造的に満たす。
export interface WipeVersion {
  id: string;
  versionNumber: number;
  versionLabel: string | null;
  providerId: string;
  videoId: string;
  originalUrl: string;
}

// <video> ベースでネイティブ再生できるプロバイダーのみワイプ比較の対象
export const WIPE_PLAYABLE_PROVIDERS = new Set(['direct', 'r2', 'bunny']);

// 追従側(B)がこの秒数以上ズレたら currentTime を合わせ直す
const DRIFT_TOLERANCE_SECONDS = 0.1;
// 補正シーク同士の最小間隔。バッファリング中に毎フレームシークして
// 逆にカクつくのを防ぐ
const RESYNC_COOLDOWN_MS = 500;
// 分割線のドラッグ可動域(端に張り付いて掴めなくなるのを防ぐ)
const MIN_WIPE_PERCENT = 2;
const MAX_WIPE_PERCENT = 98;

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function versionLabelText(version: WipeVersion): string {
  return version.versionLabel || `バージョン ${version.versionNumber}`;
}

/**
 * <video> 要素にバージョンのソースを割り当てる。Bunny は HLS(ネイティブ or hls.js)、
 * 失敗時は /original に一度だけフォールバック。r2/direct は既存のガードを通した
 * URL をそのまま再生する。戻り値はクリーンアップ関数。
 */
function attachVideoSource(videoEl: HTMLVideoElement, version: WipeVersion): () => void {
  let hls: Hls | null = null;
  let usedFallback = false;
  let onNativeError: (() => void) | null = null;

  if (version.providerId === 'bunny') {
    const bunnyCdnHostname = resolvePublicBunnyCdnHostname();
    if (bunnyCdnHostname) {
      const hlsUrl = `https://${bunnyCdnHostname}/${version.videoId}/playlist.m3u8`;
      const originalUrl = `https://${bunnyCdnHostname}/${version.videoId}/original`;

      const fallbackToOriginal = () => {
        if (usedFallback) return;
        usedFallback = true;
        if (hls) {
          try {
            hls.destroy();
          } catch {
            /* ignore */
          }
          hls = null;
        }
        videoEl.src = originalUrl;
        videoEl.load();
      };

      if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        onNativeError = () => {
          if (videoEl.readyState < HTMLMediaElement.HAVE_METADATA) {
            fallbackToOriginal();
          }
        };
        videoEl.addEventListener('error', onNativeError);
        videoEl.src = hlsUrl;
        videoEl.load();
      } else if (Hls.isSupported()) {
        const hlsInstance = new Hls();
        hls = hlsInstance;
        hlsInstance.attachMedia(videoEl);
        hlsInstance.on(Hls.Events.MEDIA_ATTACHED, () => {
          hlsInstance.loadSource(hlsUrl);
        });
        hlsInstance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            fallbackToOriginal();
          }
        });
      } else {
        fallbackToOriginal();
      }
    }
  } else {
    const url = version.providerId === 'r2' ? resolveR2PlaybackUrl(version) : version.originalUrl;
    if (isPlayableVideoUrl(url)) {
      videoEl.src = url;
      videoEl.load();
    } else {
      console.error('ワイプ比較: 再生できないURLのため読み込みをスキップしました:', url);
    }
  }

  return () => {
    if (onNativeError) videoEl.removeEventListener('error', onNativeError);
    if (hls) {
      try {
        hls.destroy();
      } catch {
        /* ignore */
      }
      hls = null;
    }
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
  };
}

/**
 * ワイプ比較ビュー。2つの <video> を同サイズで重ね、上のレイヤー(B)を
 * clip-path で左から X% 切り抜くことで、分割線の左に A・右に B が見える。
 * 再生は A をマスターにして B を追従させる(音声も A のみ、B は常にミュート)。
 */
export default function WipeCompareView({
  versionA,
  versionB,
}: {
  versionA: WipeVersion;
  versionB: WipeVersion;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [wipePercent, setWipePercent] = useState(50);

  // 高頻度に変わる値は ref に持ち、RAF ループで DOM を直接更新する
  // (親の並べて表示ビューと同じパターン)
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const isDraggingTimelineRef = useRef(false);
  const lastResyncRef = useRef(0);
  const lastCommitRef = useRef(0);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timecodeRef = useRef<HTMLSpanElement>(null);

  // ソースの割り当て(バージョンが変わったら読み込み直す)
  useEffect(() => {
    const videoEl = videoARef.current;
    if (!videoEl) return;
    return attachVideoSource(videoEl, versionA);
  }, [versionA]);

  useEffect(() => {
    const videoEl = videoBRef.current;
    if (!videoEl) return;
    // 音声は A のみ再生する(Bは常にミュート)
    videoEl.muted = true;
    return attachVideoSource(videoEl, versionB);
  }, [versionB]);

  const updateTimelineDom = useCallback((time: number, dur: number) => {
    if (dur <= 0) return;
    const pct = Math.max(0, Math.min(100, (time / dur) * 100));
    if (progressBarRef.current) progressBarRef.current.style.width = `${pct}%`;
    if (playheadRef.current) playheadRef.current.style.left = `calc(${pct}% - 2px)`;
    if (timecodeRef.current) {
      timecodeRef.current.textContent = `${formatTime(time)} / ${formatTime(dur)}`;
    }
  }, []);

  // RAF ループ: A をソースオブトゥルースとして時刻/再生状態を読み、
  // B がズレていたら currentTime を合わせ直す
  useEffect(() => {
    let rafId: number;
    const tick = (timestamp: number) => {
      const videoA = videoARef.current;
      const videoB = videoBRef.current;
      if (videoA && videoB) {
        // 尺が異なる場合は短い方をスクラブ範囲にする
        const durA = Number.isFinite(videoA.duration) ? videoA.duration : 0;
        const durB = Number.isFinite(videoB.duration) ? videoB.duration : 0;
        durationRef.current = durA > 0 && durB > 0 ? Math.min(durA, durB) : Math.max(durA, durB);
        const dur = durationRef.current;

        if (!isDraggingTimelineRef.current) {
          const t = videoA.currentTime;
          currentTimeRef.current = t;
          const playing = !videoA.paused && !videoA.ended;

          // 短い方の終端に到達したら両方停止(範囲外の再生を防ぐ)
          if (playing && dur > 0 && t >= dur) {
            videoA.pause();
            videoB.pause();
          }

          // ドリフト補正: ±0.1s を超えたら B を A に合わせる
          if (playing && timestamp - lastResyncRef.current >= RESYNC_COOLDOWN_MS) {
            if (Math.abs(videoB.currentTime - t) > DRIFT_TOLERANCE_SECONDS) {
              lastResyncRef.current = timestamp;
              try {
                videoB.currentTime = t;
              } catch {
                /* メタデータ未取得などでシーク不能な場合は無視 */
              }
            }
          }

          updateTimelineDom(t, dur);

          // React への反映は ~250ms に間引く
          if (timestamp - lastCommitRef.current >= 250) {
            lastCommitRef.current = timestamp;
            setIsPlaying(playing);
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [updateTimelineDom]);

  // =====================
  // 共有再生コントロール
  // =====================
  const handlePlayPause = useCallback(() => {
    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!videoA || !videoB) return;

    if (!videoA.paused) {
      videoA.pause();
      videoB.pause();
      setIsPlaying(false);
      return;
    }

    let t = videoA.currentTime;
    const dur = durationRef.current;
    if (dur > 0 && t >= dur) {
      // 終端で再生したら先頭に戻す
      t = 0;
      videoA.currentTime = 0;
    }
    try {
      videoB.currentTime = t;
    } catch {
      /* ignore */
    }
    videoB.muted = true;
    videoA.play().catch((err) => console.error('ワイプ比較: 再生エラー(A):', err));
    videoB.play().catch((err) => console.error('ワイプ比較: 再生エラー(B):', err));
    setIsPlaying(true);
  }, []);

  const seekBoth = useCallback(
    (time: number) => {
      const videoA = videoARef.current;
      const videoB = videoBRef.current;
      const dur = durationRef.current;
      const clamped = Math.max(0, dur > 0 ? Math.min(time, dur) : time);
      currentTimeRef.current = clamped;
      if (videoA) {
        try {
          videoA.currentTime = clamped;
        } catch {
          /* ignore */
        }
      }
      if (videoB) {
        try {
          videoB.currentTime = clamped;
        } catch {
          /* ignore */
        }
      }
      updateTimelineDom(clamped, dur);
    },
    [updateTimelineDom]
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      if (!timelineRef.current || durationRef.current <= 0) return;
      const rect = timelineRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seekBoth(fraction * durationRef.current);
    },
    [seekBoth]
  );

  // タイムラインのドラッグ(Pointer Events でマウス/タッチ両対応)
  const handleTimelinePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (durationRef.current <= 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingTimelineRef.current = true;
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const handleTimelinePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingTimelineRef.current) return;
      seekFromClientX(e.clientX);
    },
    [seekFromClientX]
  );

  const handleTimelinePointerUp = useCallback(() => {
    isDraggingTimelineRef.current = false;
  }, []);

  // 分割線のドラッグ(Pointer Events でマウス/タッチ両対応)
  const handleDividerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handleDividerPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const containerEl = containerRef.current;
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setWipePercent(Math.max(MIN_WIPE_PERCENT, Math.min(MAX_WIPE_PERCENT, pct)));
  }, []);

  const handleDividerKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const delta = e.key === 'ArrowLeft' ? -2 : 2;
    setWipePercent((prev) => Math.max(MIN_WIPE_PERCENT, Math.min(MAX_WIPE_PERCENT, prev + delta)));
  }, []);

  // キーボードショートカット(親のショートカットはワイプ中は対象プレイヤーが無いため、
  // ここで最小限の再生操作だけ提供する)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;

      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBoth(currentTimeRef.current - 5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBoth(currentTimeRef.current + 5);
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, seekBoth]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* 重ねた2つの動画。上のレイヤー(B)を clip-path で左から切り抜く */}
      <div ref={containerRef} className="relative flex-1 min-h-0 bg-black select-none">
        <video
          ref={videoARef}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          preload="metadata"
          playsInline
        />
        <video
          ref={videoBRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ clipPath: `inset(0 0 0 ${wipePercent}%)` }}
          preload="metadata"
          playsInline
          muted
        />

        {/* A/B ラベル */}
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 pointer-events-none">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            v{versionA.versionNumber}
          </Badge>
          <span className="text-xs text-white truncate max-w-[160px]">
            {versionLabelText(versionA)}
          </span>
        </div>
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded bg-black/60 px-2 py-1 pointer-events-none">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            v{versionB.versionNumber}
          </Badge>
          <span className="text-xs text-white truncate max-w-[160px]">
            {versionLabelText(versionB)}
          </span>
        </div>

        {/* ドラッグ可能な分割線 */}
        <div
          className="absolute top-0 bottom-0 z-20 w-6 -translate-x-1/2 cursor-ew-resize touch-none flex items-center justify-center"
          style={{ left: `${wipePercent}%` }}
          onPointerDown={handleDividerPointerDown}
          onPointerMove={handleDividerPointerMove}
          onKeyDown={handleDividerKeyDown}
          role="slider"
          tabIndex={0}
          aria-label="ワイプ位置"
          aria-valuemin={MIN_WIPE_PERCENT}
          aria-valuemax={MAX_WIPE_PERCENT}
          aria-valuenow={Math.round(wipePercent)}
          aria-orientation="horizontal"
        >
          <div className="absolute top-0 bottom-0 w-0.5 bg-white/90 shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
          <div className="relative h-8 w-4 rounded-full bg-white shadow flex flex-col items-center justify-center gap-0.5">
            <span className="block h-3 w-0.5 rounded bg-neutral-400" />
          </div>
        </div>
      </div>

      {/* 最小限の共有コントロール: 再生/停止・タイムコード・スクラバー */}
      <div className="shrink-0 px-4 py-2 bg-background border-t">
        <div className="flex items-center gap-2 mb-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handlePlayPause}
            title={isPlaying ? '停止' : '再生'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </Button>
          <span ref={timecodeRef} className="text-xs text-muted-foreground tabular-nums">
            {formatTime(0)} / {formatTime(0)}
          </span>
        </div>

        <div
          ref={timelineRef}
          className="relative h-8 bg-muted rounded cursor-pointer select-none touch-none"
          onPointerDown={handleTimelinePointerDown}
          onPointerMove={handleTimelinePointerMove}
          onPointerUp={handleTimelinePointerUp}
          onPointerCancel={handleTimelinePointerUp}
        >
          <div
            ref={progressBarRef}
            className="absolute left-0 top-0 h-full bg-primary/30 rounded pointer-events-none"
            style={{ width: '0%' }}
          />
          <div
            ref={playheadRef}
            className="absolute top-0 h-full w-1 bg-primary rounded pointer-events-none"
            style={{ left: 'calc(0% - 2px)' }}
          />
        </div>
      </div>
    </div>
  );
}
