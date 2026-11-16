-- CreateTable
CREATE TABLE "BoardPreview" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "widthMm" DOUBLE PRECISION NOT NULL,
    "heightMm" DOUBLE PRECISION NOT NULL,
    "layerCount" INTEGER NOT NULL DEFAULT 2,
    "thicknessMm" DOUBLE PRECISION NOT NULL DEFAULT 1.6,
    "finish" TEXT NOT NULL DEFAULT 'ENIG',
    "maskColor" TEXT NOT NULL DEFAULT 'green',
    "silkColor" TEXT NOT NULL DEFAULT 'white',
    "files" JSONB,
    "artwork" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardPreview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardPreview_createdAt_idx" ON "BoardPreview"("createdAt");

