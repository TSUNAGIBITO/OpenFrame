-- 撮影者が編集者に渡す未編集の生素材フラグ(#68)
ALTER TABLE "video_assets" ADD COLUMN "isMaterial" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "video_assets_videoId_isMaterial_idx" ON "video_assets"("videoId", "isMaterial");
