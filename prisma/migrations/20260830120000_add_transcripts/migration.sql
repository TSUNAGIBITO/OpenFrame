-- 文字起こしテーブル(faster-whisperワーカーが生成、バージョンごとに1件)
CREATE TABLE "transcripts" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "language" TEXT,
    "segments" JSONB,
    "error" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "transcripts_versionId_key" ON "transcripts"("versionId");
CREATE INDEX "transcripts_status_createdAt_idx" ON "transcripts"("status", "createdAt");

ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "video_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
