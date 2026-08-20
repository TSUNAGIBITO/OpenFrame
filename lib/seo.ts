const FALLBACK_SITE_URL = 'https://open-frame.net';

function normalizeSiteUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return FALLBACK_SITE_URL;
  }

  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return FALLBACK_SITE_URL;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

export function getSiteUrl(): string {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL);
}

export const seoConfig = {
  name: 'つなぐレビュー',
  title: '合同会社ツナギビト 動画レビューツール',
  description:
    'つなぐレビューは、合同会社ツナギビト社内向けの動画レビュー・承認ツールです。タイムスタンプ付きのコメントや音声メモをひとつのタイムラインに集約します。',
  keywords: ['つなぐレビュー', 'ツナギビト', '動画レビュー', '動画承認', 'タイムスタンプフィードバック'],
  url: getSiteUrl(),
  ogImage: '/meta.webp',
  logoPath: '/icon.svg',
  logo: '/icon.svg?v=2',
  githubUrl: 'https://github.com/TSUNAGIBITO/OpenFrame',
} as const;
