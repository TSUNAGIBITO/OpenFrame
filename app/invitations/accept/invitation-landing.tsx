import Link from 'next/link';
import { Video, UserPlus, LogIn, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { InvitationPreview } from '@/lib/invitations';

interface InvitationLandingProps {
  token: string;
  preview: InvitationPreview | null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Video className="h-8 w-8 text-primary" />
          <span className="font-bold text-2xl">つなぐレビュー</span>
        </Link>
        {children}
      </div>
    </div>
  );
}

function UnusableInvitation({ title, message }: { title: string; message: string }) {
  return (
    <Shell>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <MailWarning className="h-5 w-5 text-amber-500" />
            {title}
          </CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/login">サインイン</Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            招待した方に新しい招待リンクの送付を依頼してください。
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

/** Too many unauthenticated invitation lookups from this client — nothing was queried. */
export function InvitationRateLimited() {
  return (
    <UnusableInvitation
      title="試行回数が多すぎます"
      message="現在この招待を確認できませんでした。数分待ってから、もう一度リンクを開いてください。"
    />
  );
}

/** Signed in, but with an account whose address the invitation was not issued to. */
export function InvitationAccountMismatch({
  invitedEmail,
  signedInEmail,
}: {
  invitedEmail: string;
  signedInEmail: string;
}) {
  return (
    <Shell>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <MailWarning className="h-5 w-5 text-amber-500" />
            アカウントが異なります
          </CardTitle>
          <CardDescription>
            この招待は <strong>{invitedEmail}</strong> 宛に送信されていますが、現在{' '}
            <strong>{signedInEmail}</strong> でサインインしています。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/signout">サインアウトしてアカウントを切り替える</Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard">ダッシュボードに戻る</Link>
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            サインアウト後、メールに記載された招待リンクをもう一度開いてください。
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

export function InvitationLanding({ token, preview }: InvitationLandingProps) {
  const acceptPath = `/invitations/accept?token=${encodeURIComponent(token)}`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(acceptPath)}`;

  if (!preview) {
    return (
      <UnusableInvitation
        title="招待が見つかりません"
        message="この招待リンクは無効です。取り消されたか、新しいリンクに差し替えられた可能性があります。"
      />
    );
  }

  if (preview.status === 'CANCELED') {
    return (
      <UnusableInvitation
        title="招待が取り消されました"
        message="この招待は無効になりました。"
      />
    );
  }

  if (preview.status === 'EXPIRED' || preview.isExpired) {
    return (
      <UnusableInvitation
        title="招待の有効期限が切れました"
        message={`${preview.email} 宛の招待は有効期限が切れています。`}
      />
    );
  }

  const registerHref =
    `/register?invitationToken=${encodeURIComponent(token)}` +
    `&email=${encodeURIComponent(preview.email)}` +
    `&callbackUrl=${encodeURIComponent(acceptPath)}`;

  const alreadyAccepted = preview.status === 'ACCEPTED';
  const targetLabel = preview.targetName
    ? `${preview.targetName}（${preview.scopeLabel}）`
    : `${preview.scopeLabel}`;

  return (
    <Shell>
      <Card>
        <CardHeader className="text-center">
          <CardTitle>招待が届いています</CardTitle>
          <CardDescription>
            {preview.inviterName}さんが、つなぐレビューの <strong>{targetLabel}</strong> に{' '}
            {preview.roleLabel}として招待しています。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">
              この招待は{' '}
              <strong className="text-foreground">{preview.email}</strong> 宛に送信されています。
              {preview.hasAccount || alreadyAccepted
                ? 'このメールアドレスでサインインして承諾してください。'
                : 'このメールアドレスを使って承諾してください。'}
            </p>
          </div>

          {preview.hasAccount || alreadyAccepted ? (
            <>
              <Button asChild className="w-full">
                <Link href={loginHref}>
                  <LogIn className="h-4 w-4 mr-2" />
                  サインインして承諾
                </Link>
              </Button>
              {!alreadyAccepted && (
                <p className="text-center text-sm text-muted-foreground">
                  メールアドレスが違いますか？{' '}
                  <Link href={registerHref} className="text-primary hover:underline">
                    新しくアカウントを作成する
                  </Link>
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                まだつなぐレビューのアカウントをお持ちではありません。アカウントを作成してこの{' '}
                {preview.scopeLabel} を開きましょう。サインインが完了したら、すぐにこの画面へお戻しします。
              </p>
              <Button asChild className="w-full">
                <Link href={registerHref}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  アカウントを作成
                </Link>
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                すでにアカウントをお持ちの方は{' '}
                <Link href={loginHref} className="text-primary hover:underline">
                  サインイン
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}
