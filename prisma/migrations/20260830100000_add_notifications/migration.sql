-- アプリ内通知(ヘッダーのベルアイコン)。message は書き込み時点で日本語の
-- 表示文として組み立て済みなので、読み出し側はそのまま表示するだけでよい。
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkUrl" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- ベル表示のクエリは常に「自分宛 + 未読優先 + 新しい順」なので複合インデックス一本で賄う
CREATE INDEX "notifications_userId_readAt_createdAt_idx"
    ON "notifications"("userId", "readAt", "createdAt" DESC);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
