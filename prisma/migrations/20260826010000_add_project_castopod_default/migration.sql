-- プロジェクト単位のCastopod配信先デフォルト(新規動画作成時の初期値)。任意設定
ALTER TABLE "projects" ADD COLUMN "castopodShowId" TEXT;
