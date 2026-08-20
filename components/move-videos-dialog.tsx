'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FolderInput, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface MoveTarget {
  id: string;
  name: string;
}

interface MoveVideosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Source project the videos currently belong to. */
  projectId: string;
  /** Videos to move. */
  videoIds: string[];
  /** Called after a successful move with the ids that were moved. */
  onMoved?: (movedIds: string[]) => void;
}

export function MoveVideosDialog({
  open,
  onOpenChange,
  projectId,
  videoIds,
  onMoved,
}: MoveVideosDialogProps) {
  const router = useRouter();
  const [targets, setTargets] = useState<MoveTarget[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoading(true);
    setLoadError('');
    setTargets(null);
    setSelectedId('');

    fetch(`/api/projects/${projectId}/videos/move`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(typeof body?.error === 'string' ? body.error : 'プロジェクトの読み込みに失敗しました');
        }
        if (cancelled) return;
        setTargets((body?.data?.projects as MoveTarget[] | undefined) ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'プロジェクトの読み込みに失敗しました');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  const count = videoIds.length;
  const noun = count === 1 ? '動画' : '動画';

  const handleMove = async () => {
    if (!selectedId || isMoving) return;
    setIsMoving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/videos/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds, targetProjectId: selectedId }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(typeof body?.error === 'string' ? body.error : '動画を移動できませんでした');
        return;
      }
      toast.success(typeof body?.data?.message === 'string' ? body.data.message : '動画を移動しました');
      onOpenChange(false);
      onMoved?.(videoIds);
      router.refresh();
    } catch {
      toast.error('動画を移動できませんでした');
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {count === 1 ? '動画' : `${count}件の動画`}を別のプロジェクトに移動
          </DialogTitle>
          <DialogDescription>
            このワークスペース内の移動先プロジェクトを選んでください。バージョン・コメント・アセットも
            {noun}と一緒に移動します。
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              プロジェクトを読み込み中…
            </div>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : targets && targets.length > 0 ? (
            <Select value={selectedId} onValueChange={setSelectedId} disabled={isMoving}>
              <SelectTrigger>
                <SelectValue placeholder="プロジェクトを選択" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target.id} value={target.id}>
                    {target.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              このワークスペースには移動先にできる他のプロジェクトがありません。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isMoving}>
            キャンセル
          </Button>
          <Button onClick={handleMove} disabled={!selectedId || isMoving}>
            {isMoving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FolderInput className="h-4 w-4 mr-2" />
            )}
            移動
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
