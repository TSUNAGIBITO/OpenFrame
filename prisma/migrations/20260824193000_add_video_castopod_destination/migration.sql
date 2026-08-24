-- 承認完了時につなぐホスティング(Castopod)へ転送する先(#66)。任意設定
ALTER TABLE "videos" ADD COLUMN "castopodShowId" TEXT;
ALTER TABLE "videos" ADD COLUMN "castopodEpisodeId" TEXT;
