-- 動画の1階層フォルダ(ラベル)。NULL=未分類。最大80文字はAPI側で強制する
ALTER TABLE "videos" ADD COLUMN "folder" TEXT;
