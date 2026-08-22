/**
 * Google ドライブ / Google ドキュメント系 URL を、認証不要の埋め込み表示 URL に変換する。
 *
 * リンク素材 (VideoAssetProvider.EXTERNAL_LINK) のプレビューで使う。OAuth 連携なしで
 * 「リンクを知っている全員」共有のフォルダ・ファイルをアプリ内にそのまま表示できる。
 * 対象外の URL や共有設定が閉じている場合は null を返し、呼び出し側は従来どおり
 * 「新しいタブで開く」ボタンだけを出す。
 */

const DRIVE_ID = /^[-\w]{10,}$/;

function extractDocsPreview(url: URL): string | null {
  // docs.google.com/document|spreadsheets|presentation/d/<ID>/... → /preview
  const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([-\w]{10,})/);
  if (!match) return null;
  return `https://docs.google.com/${match[1]}/d/${match[2]}/preview`;
}

function extractDrivePreview(url: URL): string | null {
  // フォルダ: /drive/folders/<ID> や /drive/u/0/folders/<ID> → 中身の一覧を埋め込み表示
  const folder = url.pathname.match(/\/folders\/([-\w]{10,})/);
  if (folder) {
    return `https://drive.google.com/embeddedfolderview?id=${folder[1]}#list`;
  }

  // ファイル: /file/d/<ID>/... → ファイルプレビュー(画像・動画・PDF等をインライン表示)
  const file = url.pathname.match(/^\/file\/d\/([-\w]{10,})/);
  if (file) {
    return `https://drive.google.com/file/d/${file[1]}/preview`;
  }

  // 旧形式: /open?id=<ID> (ファイル・フォルダの区別が付かないためファイルプレビュー扱い)
  if (url.pathname === '/open') {
    const id = url.searchParams.get('id') ?? '';
    if (DRIVE_ID.test(id)) {
      return `https://drive.google.com/file/d/${id}/preview`;
    }
  }

  return null;
}

export function resolveGoogleDriveEmbedUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  if (url.hostname === 'drive.google.com') return extractDrivePreview(url);
  if (url.hostname === 'docs.google.com') return extractDocsPreview(url);
  return null;
}
