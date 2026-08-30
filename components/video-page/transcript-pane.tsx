'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Loader2, RefreshCw, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptState {
  status: 'queued' | 'processing' | 'done' | 'error';
  language: string | null;
  segments: TranscriptSegment[] | null;
  error: string | null;
}

interface TranscriptPaneProps {
  versionId: string | null;
  formatTime: (value: number) => string;
  onSeek: (seconds: number) => void;
  isActive: boolean;
}

// 文字起こしペイン。生成はサーバーのワーカーが非同期で行うため、
// queued/processing の間は10秒間隔でポーリングする
export function TranscriptPane({ versionId, formatTime, onSeek, isActive }: TranscriptPaneProps) {
  const [transcript, setTranscript] = useState<TranscriptState | null>(null);
  const [canTranscribe, setCanTranscribe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [query, setQuery] = useState('');
  const pollRef = useRef<number | null>(null);

  const fetchTranscript = useCallback(async () => {
    if (!versionId) return;
    try {
      const res = await fetch(`/api/versions/${versionId}/transcript`);
      if (!res.ok) return;
      const body = await res.json();
      setTranscript(body?.data?.transcript ?? null);
      setCanTranscribe(!!body?.data?.canTranscribe);
    } catch {
      // ネットワーク失敗時は次のポーリングに任せる
    }
  }, [versionId]);

  useEffect(() => {
    if (!isActive || !versionId) return;
    setIsLoading(true);
    fetchTranscript().finally(() => setIsLoading(false));
  }, [isActive, versionId, fetchTranscript]);

  // 実行中はポーリング
  useEffect(() => {
    const status = transcript?.status;
    if (!isActive || (status !== 'queued' && status !== 'processing')) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = window.setInterval(fetchTranscript, 10_000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isActive, transcript?.status, fetchTranscript]);

  const requestTranscription = async () => {
    if (!versionId) return;
    setIsRequesting(true);
    try {
      const res = await fetch(`/api/versions/${versionId}/transcript`, { method: 'POST' });
      if (res.ok) {
        await fetchTranscript();
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const filteredSegments = useMemo(() => {
    const segments = transcript?.segments ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter((segment) => segment.text.toLowerCase().includes(q));
  }, [transcript?.segments, query]);

  if (!versionId) {
    return <p className="text-sm text-muted-foreground">バージョンがありません</p>;
  }

  if (isLoading && !transcript) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="text-center py-8 text-muted-foreground space-y-3">
        <FileText className="h-8 w-8 mx-auto opacity-50" />
        <p className="text-sm">まだ文字起こしがありません</p>
        {canTranscribe ? (
          <Button size="sm" onClick={requestTranscription} disabled={isRequesting}>
            {isRequesting ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-1" />
            )}
            文字起こしを生成
          </Button>
        ) : (
          <p className="text-xs">
            この動画のプロバイダ(YouTube等)は文字起こしに対応していません
          </p>
        )}
      </div>
    );
  }

  if (transcript.status === 'queued' || transcript.status === 'processing') {
    return (
      <div className="text-center py-8 text-muted-foreground space-y-2">
        <Loader2 className="h-6 w-6 mx-auto animate-spin" />
        <p className="text-sm">
          {transcript.status === 'queued' ? '文字起こしの順番待ちです…' : '文字起こしを実行中です…'}
        </p>
        <p className="text-xs">動画の長さに応じて数分〜数十分かかります。このまま閉じても大丈夫です</p>
      </div>
    );
  }

  if (transcript.status === 'error') {
    return (
      <div className="text-center py-8 text-muted-foreground space-y-3">
        <p className="text-sm text-destructive">文字起こしに失敗しました</p>
        {transcript.error && <p className="text-xs break-words">{transcript.error}</p>}
        <Button size="sm" variant="outline" onClick={requestTranscription} disabled={isRequesting}>
          <RefreshCw className="h-4 w-4 mr-1" />
          もう一度試す
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="文字起こしを検索..."
          className="h-8 pl-8 text-sm"
        />
      </div>
      {filteredSegments.length === 0 ? (
        <p className="text-center py-6 text-sm text-muted-foreground">
          {query ? '一致する箇所がありません' : '文字起こし結果が空でした'}
        </p>
      ) : (
        <div className="space-y-1">
          {filteredSegments.map((segment, index) => (
            <button
              key={`${segment.start}-${index}`}
              type="button"
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-accent transition-colors flex gap-2 items-baseline"
              onClick={() => onSeek(segment.start)}
            >
              <span className="text-xs font-medium text-primary tabular-nums shrink-0">
                {formatTime(segment.start)}
              </span>
              <span className="text-sm">{segment.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
