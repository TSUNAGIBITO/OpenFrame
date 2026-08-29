'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { MentionUser, VideoAsset } from '@/components/video-page/types';

type MentionRange = {
  start: number;
  end: number;
  query: string;
};

type Suggestion =
  | { type: 'user'; user: MentionUser }
  | { type: 'asset'; asset: VideoAsset };

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  assets: VideoAsset[];
  users?: MentionUser[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onPaste?: React.ClipboardEventHandler<HTMLTextAreaElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  autoFocus?: boolean;
  disabled?: boolean;
}

function findMentionRange(text: string, caret: number): MentionRange | null {
  const before = text.slice(0, caret);
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) return null;

  const charBeforeAt = atIndex === 0 ? ' ' : before[atIndex - 1];
  if (charBeforeAt && !/\s/.test(charBeforeAt)) return null;

  const query = before.slice(atIndex + 1);
  if (query.length === 0) {
    return { start: atIndex, end: caret, query: '' };
  }

  if (/\s|\[|\]|\(|\)/.test(query)) return null;

  return { start: atIndex, end: caret, query };
}

export function MentionTextarea({
  value,
  onChange,
  assets,
  users = [],
  placeholder,
  rows = 2,
  className,
  onPaste,
  onKeyDown,
  autoFocus,
  disabled,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mentionRange, setMentionRange] = useState<MentionRange | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // メンション挿入後のカーソル復帰要求。ref操作をrender外(effect)に隔離するための状態
  const [cursorRequest, setCursorRequest] = useState<{ pos: number } | null>(null);

  useEffect(() => {
    if (!cursorRequest) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(cursorRequest.pos, cursorRequest.pos);
  }, [cursorRequest]);

  const searchableUsers = useMemo(() => {
    return users
      .filter((user) => (user.name ?? '').trim().length > 0)
      .map((user) => ({ user, displayNameLower: (user.name ?? '').toLowerCase() }));
  }, [users]);

  const searchableAssets = useMemo(() => {
    return assets
      .map((asset) => ({
        asset,
        displayNameLower: asset.displayName.toLowerCase(),
        createdAtMs: Date.parse(asset.createdAt),
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [assets]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!mentionRange) return [];
    const query = mentionRange.query.trim().toLowerCase();
    const matchedUsers = (
      query
        ? searchableUsers.filter((entry) => entry.displayNameLower.includes(query))
        : searchableUsers
    )
      .slice(0, 5)
      .map((entry): Suggestion => ({ type: 'user', user: entry.user }));
    const matchedAssets = (
      query
        ? searchableAssets.filter((entry) => entry.displayNameLower.includes(query))
        : searchableAssets
    )
      .slice(0, 8 - Math.min(matchedUsers.length, 4))
      .map((entry): Suggestion => ({ type: 'asset', asset: entry.asset }));
    return [...matchedUsers, ...matchedAssets];
  }, [mentionRange, searchableUsers, searchableAssets]);

  const closeMentions = () => {
    setMentionRange(null);
    setActiveIndex(0);
  };

  const insertMention = (suggestion: Suggestion) => {
    if (!mentionRange) return;
    const mentionToken =
      suggestion.type === 'user'
        ? `@[${suggestion.user.name}](user:${suggestion.user.id}) `
        : `@[${suggestion.asset.displayName}](asset:${suggestion.asset.id}) `;
    const nextValue = `${value.slice(0, mentionRange.start)}${mentionToken}${value.slice(mentionRange.end)}`;
    onChange(nextValue);
    closeMentions();

    setCursorRequest({ pos: mentionRange.start + mentionToken.length });
  };

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    onChange(nextValue);

    const caret = event.target.selectionStart ?? nextValue.length;
    const range = findMentionRange(nextValue, caret);
    setMentionRange(range);
    setActiveIndex(0);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (event) => {
    if (mentionRange) {
      if (suggestions.length > 0) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          const selected = suggestions[Math.min(activeIndex, suggestions.length - 1)];
          if (selected) insertMention(selected);
          return;
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeMentions();
        return;
      }
    }

    onKeyDown?.(event);
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        className={className}
        onPaste={onPaste}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        disabled={disabled}
        onBlur={() => {
          window.setTimeout(closeMentions, 120);
        }}
      />

      {mentionRange && (
        <div className="absolute left-0 right-0 bottom-full mb-1 z-30 rounded-md border bg-popover shadow-md overflow-hidden">
          {suggestions.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              メンバー・アセットが見つかりません
            </div>
          ) : (
            suggestions.map((suggestion, index) => {
              const key =
                suggestion.type === 'user'
                  ? `user-${suggestion.user.id}`
                  : `asset-${suggestion.asset.id}`;
              return (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    'w-full text-left px-2 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1.5',
                    index === activeIndex && 'bg-accent'
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMention(suggestion);
                  }}
                >
                  {suggestion.type === 'user' ? (
                    <>
                      {suggestion.user.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={suggestion.user.image}
                          alt=""
                          className="h-4 w-4 rounded-full shrink-0"
                        />
                      ) : (
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="font-medium truncate">@{suggestion.user.name}</span>
                      <span className="ml-auto text-muted-foreground shrink-0">メンバー</span>
                    </>
                  ) : (
                    <>
                      <span className="font-medium truncate">
                        @{suggestion.asset.displayName}
                      </span>
                      <span className="ml-auto text-muted-foreground shrink-0">
                        {suggestion.asset.provider}
                      </span>
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
