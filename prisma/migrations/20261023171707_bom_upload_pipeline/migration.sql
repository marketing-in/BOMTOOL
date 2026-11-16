-- AlterTable
ALTER TABLE "BomLine" ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rawRow" JSONB,
ADD COLUMN     "rawValue" TEXT,
ADD COLUMN     "requiredQty" INTEGER;

-- AlterTable
ALTER TABLE "BomLineMatch" ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "BomRevision" ADD COLUMN     "headerRow" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rawRows" JSONB,
ADD COLUMN     "scoredAt" TIMESTAMP(3),
ADD COLUMN     "scores" JSONB,
ADD COLUMN     "sheetName" TEXT;
