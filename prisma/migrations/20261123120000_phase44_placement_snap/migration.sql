-- Phase 44: parts on their own pads. The file's position is kept beside the corrected one.
ALTER TABLE "Placement" ADD COLUMN "cadX" DOUBLE PRECISION,
ADD COLUMN "cadY" DOUBLE PRECISION,
ADD COLUMN "cadRotation" DOUBLE PRECISION,
ADD COLUMN "snap" TEXT,
ADD COLUMN "copper" TEXT,
ADD COLUMN "padCount" INTEGER,
ADD COLUMN "padLength" DOUBLE PRECISION,
ADD COLUMN "padWidth" DOUBLE PRECISION;

ALTER TABLE "BoardModel" ADD COLUMN "alignment" JSONB;
