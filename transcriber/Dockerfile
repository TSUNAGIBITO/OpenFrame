# 文字起こしワーカー(faster-whisper)。appの内部APIをポーリングして
# queuedなTranscriptを処理する。モデルは初回実行時にダウンロードされ
# volume(transcriber-models)にキャッシュされる
FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir faster-whisper==1.1.1 requests==2.32.3

COPY worker.py /worker.py

CMD ["python", "-u", "/worker.py"]
