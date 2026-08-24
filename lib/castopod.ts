// つなぐレビュー → つなぐホスティング(Castopod / podcast.radio-keizai.com)への転送(#66)。
// Humming Studio 側の tsunagu-hosting.ts とは意図的に独立させている:
// Humming Studio は外部クライアントが自分の判断で即時公開するセルフサービスAPIで、
// こちらは社内の承認済みコンテンツを「配信キューに乗せる」(draft作成のみ、公開はしない)
// 別経路。認証情報は別環境変数で保持し、互いの変更が干渉しないようにする。
//
// env未設定なら機能ごと無効(fail-safe)。azuracast.ts 等と同じ conventions。

function cfg() {
  const base = process.env.CASTOPOD_API_BASE_URL;
  const username = process.env.CASTOPOD_API_USERNAME;
  const password = process.env.CASTOPOD_API_PASSWORD;
  const userIdRaw = process.env.CASTOPOD_API_USER_ID;
  const userId = userIdRaw ? Number(userIdRaw) : NaN;
  if (!base || !username || !password || !Number.isFinite(userId)) return null;
  return { base, username, password, userId };
}

/** Castopod連携が構成済みか(env未設定なら承認完了時の自動転送をスキップ) */
export function castopodConfigured(): boolean {
  return cfg() !== null;
}

async function callCastopod<T>(path: string, init: { method: string; body?: FormData }): Promise<T> {
  const c = cfg();
  if (!c) {
    throw new Error('Castopod連携が未設定です (CASTOPOD_API_BASE_URL / _USERNAME / _PASSWORD / _USER_ID)');
  }
  const auth = 'Basic ' + Buffer.from(`${c.username}:${c.password}`).toString('base64');
  const res = await fetch(`${c.base}/api/rest/v1${path}`, {
    method: init.method,
    headers: { Authorization: auth },
    body: init.body,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Castopod ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface CastopodEpisode {
  id: number;
  slug: string;
  title: string;
  audio_url: string;
  cover_url: string;
}

/**
 * 承認済みバージョンをCastopodにdraftエピソードとして作成する(公開はしない)。
 * 実際の配信タイミングはCastopod管理画面での人間の判断に委ねる。
 */
export async function createDraftEpisode(params: {
  castopodShowId: string;
  videoId: string;
  title: string;
  audioUrl: string;
}): Promise<CastopodEpisode> {
  const c = cfg();
  if (!c) throw new Error('Castopod連携が未設定です');

  const audioRes = await fetch(params.audioUrl, { signal: AbortSignal.timeout(60_000) });
  if (!audioRes.ok) throw new Error(`承認済みコンテンツの取得に失敗しました: ${audioRes.status}`);
  const audioBlob = await audioRes.blob();

  const form = new FormData();
  form.set('title', params.title);
  // slug は つなぐレビュー側の Video ID をそのまま使う(一意性が保証済み、
  // Castopod の slug バリデーション [a-zA-Z0-9\-]{1,128} を満たす cuid 形式)
  form.set('slug', params.videoId);
  form.set('podcast_id', params.castopodShowId);
  form.set('type', 'full');
  form.set('created_by', String(c.userId));
  form.set('updated_by', String(c.userId));
  form.set('audio_file', audioBlob, 'episode.mp3');

  return callCastopod<CastopodEpisode>('/episodes', { method: 'POST', body: form });
}

/**
 * 既存draftエピソードのタイトルを更新する。
 *
 * 【既知の制約】このAPI(Castopod本体には無い自前追加エンドポイント)は現状
 * タイトル・説明文のみの更新で、音声ファイルの差し替えには対応していない
 * (Humming Studio側の呼び出し元でも audio_file は送っていない)。そのため
 * 再承認で音声そのものが変わった場合、この関数を呼んでも新しい音声は
 * Castopodに反映されない。呼び出し側では「音声が変わった再承認」を検知したら
 * createDraftEpisode で新規作成する運用にする(このコメントは実装時の
 * 意図的な判断を記録するためのもの。将来PHP側の attemptUpdate が audio_file
 * を受け付けるよう拡張されたら、ここも合わせて直す)。
 */
export async function updateDraftEpisodeTitle(params: {
  castopodEpisodeId: string;
  title: string;
}): Promise<CastopodEpisode> {
  const c = cfg();
  if (!c) throw new Error('Castopod連携が未設定です');
  const form = new FormData();
  form.set('updated_by', String(c.userId));
  form.set('title', params.title);
  return callCastopod<CastopodEpisode>(`/episodes/${params.castopodEpisodeId}`, {
    method: 'POST',
    body: form,
  });
}
