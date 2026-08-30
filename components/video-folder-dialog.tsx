'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, Check, Folder, FolderMinus, FolderPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const MAX_FOLDER_NAME_LENGTH = 80;

interface VideoFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 対象動画が属するプロジェクト */
  projectId: string;
  /** フォルダを設定する動画(1件または複数) */
  videoIds: string[];
  /** プロジェクト内の既存フォルダ名一覧 */
  existingFolders: string[];
  /** 対象が1件のときの現在のフォルダ(ハイライト表示用) */
  currentFolder?: string | null;
  /** 設定成功後に呼ばれる(選択解除など) */
  onDone?: () => void;
}

// 動画をプロジェクト内フォルダ(1階層のラベル)へ割り当てる小さなダイアログ。
// 既存フォルダをクリックで即割り当て、新規フォルダ名の入力、フォルダから外す、の3操作。
export function VideoFolderDialog({
  open,
  onOpenChange,
  projectId,
  videoIds,
  existingFolders,
  currentFolder,
  onDone,
}: VideoFolderDialogProps) {
  const router = useRouter();
  const [newFolderName, setNewFolderName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    // ダイアログを開いた直後に入力をリセット(タイマー経由でlintルール対応)
    const timerId = window.setTimeout(() => {
      setNewFolderName('');
      setError('');
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [open]);

  const count = videoIds.length;
  const trimmedNewName = useMemo(() => newFolderName.trim(), [newFolderName]);

  const assignFolder = async (folder: string | null) => {
    if (isSaving || count === 0) return;
    if (folder !== null && (folder.length === 0 || folder.length > MAX_FOLDER_NAME_LENGTH)) {
      setError(`フォルダ名は1〜${MAX_FOLDER_NAME_LENGTH}文字で入力してください`);
      return;
    }
    setIsSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/videos/folder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds, folder }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'フォルダの設定に失敗しました');
        return;
      }
      toast.success(
        typeof body?.data?.message === 'string'
          ? body.data.message
          : folder
            ? `「${folder}」に移動しました`
            : 'フォルダから外しました'
      );
      onOpenChange(false);
      onDone?.();
      router.refresh();
    } catch {
      setError('フォルダの設定に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {count === 1 ? '動画' : `${count}件の動画`}をフォルダに移動
          </DialogTitle>
          <DialogDescription>
            プロジェクト内のフォルダを選ぶか、新しいフォルダ名を入力してください。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {existingFolders.length > 0 && (
            <div className="space-y-2">
              <Label>既存のフォルダ</Label>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {existingFolders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => void assignFolder(folder)}
                    disabled={isSaving}
                    className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  >
                    <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{folder}</span>
                    {currentFolder === folder && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>新しいフォルダ</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="例: 第1話、素材、完成版"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                maxLength={MAX_FOLDER_NAME_LENGTH}
                disabled={isSaving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && trimmedNewName) {
                    e.preventDefault();
                    void assignFolder(trimmedNewName);
                  }
                }}
              />
              <Button
                variant="outline"
                onClick={() => void assignFolder(trimmedNewName)}
                disabled={!trimmedNewName || isSaving}
                className="shrink-0"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                作成して移動
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => void assignFolder(null)}
            disabled={isSaving || (count === 1 && !currentFolder)}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FolderMinus className="h-4 w-4 mr-2" />
            )}
            フォルダから外す
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>
            キャンセル
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
