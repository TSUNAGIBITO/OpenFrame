import Link from 'next/link';
import { Video } from 'lucide-react';
import { LoginForm, LoginFormSkeleton } from './login-form';
import { Suspense } from 'react';

export default function LoginPage() {
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <Video className="h-8 w-8 text-primary" />
          <span className="font-bold text-2xl">つなぐレビュー</span>
        </Link>

        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm googleEnabled={googleEnabled} githubEnabled={githubEnabled} />
        </Suspense>

        <p className="text-center text-xs text-muted-foreground mt-4">
          続行することで、{' '}
          <Link href="/terms" className="underline hover:text-foreground">
            利用規約
          </Link>{' '}
          および{' '}
          <Link href="/privacy" className="underline hover:text-foreground">
            プライバシーポリシー
          </Link>
          に同意したものとみなされます
        </p>
      </div>
    </div>
  );
}
