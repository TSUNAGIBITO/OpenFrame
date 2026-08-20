'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'ナビゲーション',
    shortcuts: [{ keys: ['Ctrl', 'K'], description: '検索を開く' }],
  },
  {
    title: '再生',
    shortcuts: [
      { keys: ['Space', 'K'], description: '再生 / 一時停止' },
      { keys: ['M'], description: 'ミュート / ミュート解除' },
    ],
  },
  {
    title: 'シーク',
    shortcuts: [
      { keys: ['←'], description: '5秒戻す' },
      { keys: ['→'], description: '5秒進める' },
      { keys: ['J'], description: '10秒戻す' },
      { keys: ['L'], description: '10秒進める' },
    ],
  },
  {
    title: '再生速度',
    shortcuts: [
      { keys: ['↑'], description: '速度を上げる' },
      { keys: ['↓'], description: '速度を下げる' },
      { keys: ['⇧', '>'], description: '速度を上げる' },
      { keys: ['⇧', '<'], description: '速度を下げる' },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">キーボードショートカット</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-1">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2.5">
                {group.title}
              </h4>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <kbd
                          key={j}
                          className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
