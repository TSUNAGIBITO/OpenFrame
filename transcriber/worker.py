"""文字起こしワーカー。

appコンテナの内部API(/api/internal/transcribe)をポーリングし、queuedな
ジョブをclaim→メディアをダウンロード→faster-whisperで文字起こし→結果を
返す、を繰り返す。認証は TRANSCRIBE_INTERNAL_SECRET の固定Bearerのみ。

設計メモ:
- モデルは small / int8(2vCPU・空きメモリ約2GBのLightsail mediumで動く上限)。
  日本語の実用精度と資源のバランスでsmallを選択
- 失敗はすべてfailとしてサーバーへ報告する(黙って捨てない)。サーバー側に
  届けられない場合はログに残して次のループへ
"""

import os
import sys
import tempfile
import time
import traceback

import requests

APP_ORIGIN = os.environ.get("TRANSCRIBE_APP_ORIGIN", "http://app:3000")
SECRET = os.environ.get("TRANSCRIBE_INTERNAL_SECRET", "")
MODEL_NAME = os.environ.get("TRANSCRIBE_MODEL", "small")
POLL_SECONDS = int(os.environ.get("TRANSCRIBE_POLL_SECONDS", "15"))

if not SECRET:
    print("[transcriber] TRANSCRIBE_INTERNAL_SECRET が未設定のため終了します", flush=True)
    sys.exit(1)

HEADERS = {"Authorization": f"Bearer {SECRET}"}

_model = None


def get_model():
    """モデルは初回ジョブ時に遅延ロード(起動を速く保ち、無ジョブ時はメモリを使わない)"""
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        print(f"[transcriber] モデル {MODEL_NAME} をロード中...", flush=True)
        _model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
        print("[transcriber] モデルロード完了", flush=True)
    return _model


def api(action: str, payload: dict) -> dict:
    res = requests.post(
        f"{APP_ORIGIN}/api/internal/transcribe",
        json={"action": action, **payload},
        headers=HEADERS,
        timeout=30,
    )
    res.raise_for_status()
    return res.json().get("data", {})


def download_media(media_path: str, dest_path: str) -> None:
    with requests.get(
        f"{APP_ORIGIN}{media_path}", headers=HEADERS, stream=True, timeout=60, allow_redirects=True
    ) as res:
        res.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in res.iter_content(chunk_size=1 << 20):
                f.write(chunk)


def transcribe(path: str):
    model = get_model()
    segments_iter, info = model.transcribe(path, vad_filter=True, beam_size=5)
    segments = []
    for seg in segments_iter:
        text = seg.text.strip()
        if not text:
            continue
        segments.append({"start": round(seg.start, 3), "end": round(seg.end, 3), "text": text})
    return segments, info.language


def process_job(job: dict) -> None:
    transcript_id = job["transcriptId"]
    print(f"[transcriber] job {transcript_id} を処理開始", flush=True)
    with tempfile.TemporaryDirectory() as tmpdir:
        media_file = os.path.join(tmpdir, "media")
        download_media(job["mediaPath"], media_file)
        size = os.path.getsize(media_file)
        print(f"[transcriber] メディア取得 {size} bytes", flush=True)
        if size == 0:
            raise RuntimeError("メディアが空でした")
        started = time.time()
        segments, language = transcribe(media_file)
        elapsed = round(time.time() - started, 1)
        print(
            f"[transcriber] 文字起こし完了 {len(segments)} segments / lang={language} / {elapsed}s",
            flush=True,
        )
        api("complete", {"transcriptId": transcript_id, "segments": segments, "language": language})


def main() -> None:
    print(f"[transcriber] 起動 (origin={APP_ORIGIN}, model={MODEL_NAME})", flush=True)
    while True:
        job = None
        try:
            job = api("claim", {}).get("job")
        except Exception as err:  # appが再起動中などは静かに待つ
            print(f"[transcriber] claim失敗(リトライします): {err}", flush=True)

        if not job:
            time.sleep(POLL_SECONDS)
            continue

        try:
            process_job(job)
        except Exception as err:
            print(f"[transcriber] ジョブ失敗: {err}", flush=True)
            traceback.print_exc()
            try:
                api("fail", {"transcriptId": job["transcriptId"], "error": str(err)[:1900]})
            except Exception as report_err:
                print(f"[transcriber] 失敗報告も失敗: {report_err}", flush=True)


if __name__ == "__main__":
    main()
