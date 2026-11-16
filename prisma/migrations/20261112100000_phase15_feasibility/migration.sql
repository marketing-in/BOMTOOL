-- Phase 15: feasibility review, and what is measured off the Gerbers at upload.
ALTER TABLE "BoardModel" ADD COLUMN "fab" JSONB;
ALTER TABLE "BoardPreview" ADD COLUMN "fab" JSONB;

CREATE TABLE "FeasibilityReview" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "signoffs" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "FeasibilityReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeasibilityReview_revisionId_status_idx" ON "FeasibilityReview"("revisionId", "status");

ALTER TABLE "FeasibilityReview" ADD CONSTRAINT "FeasibilityReview_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
