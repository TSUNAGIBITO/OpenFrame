'use client';

import { memo } from 'react';
import Link from 'next/link';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface GuestNameGateProps {
  guestName: string;
  setGuestName: (value: string) => void;
  onConfirm: () => void;
}

export const GuestNameGate = memo(function GuestNameGate({
  guestName,
  setGuestName,
  onConfirm,
}: GuestNameGateProps) {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-auto p-6">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
            <User className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold mb-1">つなぐレビューへようこそ</h1>
          <p className="text-sm text-muted-foreground">
            この動画を閲覧・コメントするには、お名前を入力してください
          </p>
        </div>
        <div className="space-y-3">
          <label htmlFor="guest-name" className="sr-only">
            お名前
          </label>
          <Input
            id="guest-name"
            placeholder="お名前"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && guestName.trim()) {
                onConfirm();
              }
            }}
            autoFocus
          />
          <Button className="w-full" disabled={!guestName.trim()} onClick={onConfirm}>
            続ける
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-4">
          または{' '}
          <Link href="/login" className="text-primary hover:underline">
            ログイン
          </Link>{' '}
          してアカウントを利用する
        </p>
      </div>
    </div>
  );
});
