'use client';

import React from 'react';
import { Image as ImageIcon, UserRound, Video, Volume2 } from 'lucide-react';
import type { VideoAsset } from '@/components/video-page/types';

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const MENTION_REGEX = /@\[(.+?)\]\((asset|user):([\w-]+)\)/gi;
// 本文中の時刻表記(1:23 / 01:23 / 1:23:45)。数字の一部を誤検出しないよう前後を非数字に限定
const TIMESTAMP_REGEX = /(^|[^\d:])(\d{1,2}:(?:[0-5]\d:)?[0-5]\d)(?![\d:])/g;

interface CommentRichTextProps {
  text: string;
  onAssetMentionClick?: (assetId: string) => void;
  assets?: VideoAsset[];
  onTimestampClick?: (seconds: number) => void;
}

function parseTimestampToSeconds(value: string): number | null {
  const parts = value.split(':').map((part) => parseInt(part, 10));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// 時刻表記をクリック可能なシークリンクにする。onTimestampClick 未指定なら素通し
function renderTimestamps(
  text: string,
  keyPrefix: string,
  onTimestampClick?: (seconds: number) => void
): React.ReactNode[] {
  if (!onTimestampClick) return [<React.Fragment key={`${keyPrefix}-raw`}>{text}</React.Fragment>];

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TIMESTAMP_REGEX)) {
    const matchIndex = match.index ?? -1;
    if (matchIndex < 0) continue;
    const prefix = match[1] ?? '';
    const label = match[2] ?? '';
    const seconds = parseTimestampToSeconds(label);
    if (seconds === null) continue;

    const labelStart = matchIndex + prefix.length;
    if (labelStart > lastIndex) {
      nodes.push(
        <React.Fragment key={`${keyPrefix}-ts-txt-${lastIndex}`}>
          {text.slice(lastIndex, labelStart)}
        </React.Fragment>
      );
    }
    nodes.push(
      <button
        key={`${keyPrefix}-ts-${labelStart}`}
        type="button"
        className="text-primary font-medium hover:underline tabular-nums"
        title={`${label} へ移動`}
        onClick={(event) => {
          event.stopPropagation();
          onTimestampClick(seconds);
        }}
      >
        {label}
      </button>
    );
    lastIndex = labelStart + label.length;
  }
  if (lastIndex < text.length) {
    nodes.push(
      <React.Fragment key={`${keyPrefix}-ts-txt-${lastIndex}`}>{text.slice(lastIndex)}</React.Fragment>
    );
  }
  return nodes;
}

// `keyPrefix` scopes the indices to this slice. The function runs once per gap between
// mentions, so keying on the index alone emitted `txt-0` for several siblings and React
// warned about duplicate keys.
function renderUrls(
  text: string,
  keyPrefix: string,
  onTimestampClick?: (seconds: number) => void
): React.ReactNode[] {
  const parts = text.split(URL_REGEX);
  return parts.flatMap((part, index): React.ReactNode[] => {
    if (/^https?:\/\/[^\s]+$/.test(part)) {
      return [
        <a
          key={`${keyPrefix}-url-${index}`}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
          onClick={(event) => event.stopPropagation()}
        >
          {part}
        </a>,
      ];
    }
    return renderTimestamps(part, `${keyPrefix}-p${index}`, onTimestampClick);
  });
}

export function CommentRichText({ text, onAssetMentionClick, assets = [], onTimestampClick }: CommentRichTextProps) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MENTION_REGEX)) {
    const mentionIndex = match.index ?? -1;
    if (mentionIndex < 0) continue;

    if (mentionIndex > lastIndex) {
      nodes.push(...renderUrls(text.slice(lastIndex, mentionIndex), `s${lastIndex}`, onTimestampClick));
    }

    if (match[2] === 'user') {
      const userLabel = match[1] || 'メンバー';
      nodes.push(
        <span
          key={`user-mention-${match[3]}-${mentionIndex}`}
          className="inline-flex max-w-full items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-300 align-middle"
          title={userLabel}
        >
          <UserRound className="h-3 w-3 shrink-0" />
          <span className="truncate max-w-[190px] sm:max-w-[240px]">@{userLabel}</span>
        </span>
      );
      lastIndex = mentionIndex + match[0].length;
      continue;
    }

    const fallbackLabel = match[1] || 'アセット';
    const assetId = match[3] || '';
    const matchedAsset = assets.find((asset) => asset.id === assetId);
    const label = matchedAsset?.displayName || fallbackLabel;
    const assetKind = matchedAsset?.kind;

    nodes.push(
      <button
        key={`mention-${assetId}-${mentionIndex}`}
        type="button"
        className="inline-flex max-w-full items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-primary hover:bg-primary/20 transition-colors align-middle"
        onClick={(event) => {
          event.stopPropagation();
          if (assetId && onAssetMentionClick) onAssetMentionClick(assetId);
        }}
        title={label}
      >
        <span
          className={
            assetKind === 'VIDEO'
              ? 'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-violet-500/25 text-violet-200'
              : assetKind === 'AUDIO'
                ? 'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-blue-500/25 text-blue-200'
                : 'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-500/25 text-emerald-200'
          }
        >
          {assetKind === 'VIDEO' ? (
            <Video className="h-2.5 w-2.5" />
          ) : assetKind === 'AUDIO' ? (
            <Volume2 className="h-2.5 w-2.5" />
          ) : (
            <ImageIcon className="h-2.5 w-2.5" />
          )}
        </span>
        <span className="truncate max-w-[190px] sm:max-w-[240px]">@{label}</span>
      </button>
    );

    lastIndex = mentionIndex + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderUrls(text.slice(lastIndex), `s${lastIndex}`, onTimestampClick));
  }

  return <>{nodes}</>;
}
