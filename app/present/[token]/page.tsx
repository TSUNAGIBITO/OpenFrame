import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Clapperboard, Play } from 'lucide-react';
import { db } from '@/lib/db';
import { isShareLinkExpired, validateShareLinkAccess } from '@/lib/share-links';
import {
  getProjectShareSessionCookieName,
  parseProjectShareSessionValue,
} from '@/lib/share-session';
import { PresentUnlock } from './present-unlock';

export const metadata: Metadata = {
  title: 'プレゼンテーション | OpenFrame',
  robots: { index: false, follow: false },
};

interface PresentPageProps {
  params: Promise<{ token: string }>;
}

// 秒数を "M:SS" / "H:MM:SS" 表記に変換する
function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

// 無効/期限切れリンク用のメッセージ画面
function PresentMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center space-y-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
          <Clapperboard className="h-6 w-6 text-zinc-400" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default async function PresentPage({ params }: PresentPageProps) {
  const { token } = await params;

  // プロジェクト全体リンク(videoId=null)のみ受け付ける
  const link = await db.shareLink.findUnique({
    where: { token },
    select: { projectId: true, videoId: true, expiresAt: true },
  });

  if (!link || link.videoId !== null) {
    return (
      <PresentMessage
        title="この共有リンクは無効です"
        description="リンクが正しくないか、すでに削除されています。共有した相手に新しいリンクを発行してもらってください。"
      />
    );
  }

  // パスワード解除済みかどうかを署名付きクッキーから判定する
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(getProjectShareSessionCookieName(token))?.value;
  const session = sessionCookie ? parseProjectShareSessionValue(sessionCookie, token) : null;

  const access = await validateShareLinkAccess({
    token,
    projectId: link.projectId,
    requiredPermission: 'VIEW',
    passwordVerified: session?.passwordVerified === true,
  });

  if (access.requiresPassword) {
    return <PresentUnlock token={token} />;
  }

  if (!access.hasAccess) {
    if (isShareLinkExpired(link)) {
      return (
        <PresentMessage
          title="リンクの有効期限が切れています"
          description="このプレゼンテーションリンクは有効期限を過ぎています。共有した相手に新しいリンクを発行してもらってください。"
        />
      );
    }
    return (
      <PresentMessage
        title="この共有リンクは現在利用できません"
        description="リンクが無効になっているか、共有元の設定により閲覧できない状態です。共有した相手にお問い合わせください。"
      />
    );
  }

  // トークン→プロジェクト→動画の順にサーバー側で解決する(他プロジェクトの動画は含まれない)
  const project = await db.project.findUnique({
    where: { id: link.projectId },
    select: {
      name: true,
      description: true,
      videos: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          title: true,
          versions: {
            where: { isActive: true },
            orderBy: { versionNumber: 'desc' },
            take: 1,
            select: { thumbnailUrl: true, duration: true },
          },
        },
      },
    },
  });

  if (!project) {
    return (
      <PresentMessage
        title="この共有リンクは無効です"
        description="共有元のプロジェクトが見つかりませんでした。共有した相手にお問い合わせください。"
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-16">
        {/* ヘッダー: 納品プレゼン用の最小限の見た目 */}
        <header className="text-center mb-12">
          <p className="text-xs tracking-[0.3em] uppercase text-zinc-500 mb-3">Presentation</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="mt-3 text-sm text-zinc-400 max-w-2xl mx-auto leading-relaxed">
              {project.description}
            </p>
          )}
          <p className="mt-4 text-xs text-zinc-500">
            {project.videos.length} 本の動画 ・ クリックすると再生ページが開きます
          </p>
        </header>

        {project.videos.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 text-sm">
            このプロジェクトにはまだ動画がありません
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {project.videos.map((video, index) => {
              const version = video.versions[0] ?? null;
              const card = (
                <div className="group rounded-xl overflow-hidden border border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-600">
                  <div className="relative aspect-video bg-zinc-800">
                    {version?.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={version.thumbnailUrl}
                        alt={video.title}
                        className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500">
                        {version ? 'サムネイルなし' : '準備中'}
                      </div>
                    )}
                    {version && (
                      <>
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="h-10 w-10 text-white" fill="white" />
                        </div>
                        {typeof version.duration === 'number' && version.duration > 0 && (
                          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                            {formatDuration(version.duration)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] text-zinc-500 mb-1">
                      {String(index + 1).padStart(2, '0')}
                    </p>
                    <h2 className="text-sm font-medium text-zinc-100 truncate">{video.title}</h2>
                  </div>
                </div>
              );

              return version ? (
                <Link
                  key={video.id}
                  href={`/watch/${video.id}?shareToken=${encodeURIComponent(token)}`}
                >
                  {card}
                </Link>
              ) : (
                <div key={video.id} className="opacity-60 cursor-default">
                  {card}
                </div>
              );
            })}
          </div>
        )}

        <footer className="mt-16 text-center text-xs text-zinc-600">
          Powered by OpenFrame
        </footer>
      </div>
    </div>
  );
}
