-- Phase 46: BoM validation — competitor makers, reviewers' calls, consumables.
CREATE TYPE "CallStatus" AS ENUM ('ACCEPTED', 'PROHIBITED');
CREATE TYPE "ConsumableKind" AS ENUM ('SOLDER_PASTE', 'FLUX', 'STENCIL', 'OTHER');

CREATE TABLE "CompetitorMaker" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorMaker_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CompetitorMaker_customerId_name_key" ON "CompetitorMaker"("customerId", "name");
ALTER TABLE "CompetitorMaker" ADD CONSTRAINT "CompetitorMaker_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ValidationCall" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL,
    "reason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationCall_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ValidationCall_revisionId_key_key" ON "ValidationCall"("revisionId", "key");
ALTER TABLE "ValidationCall" ADD CONSTRAINT "ValidationCall_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Consumable" (
    "id" TEXT NOT NULL,
    "kind" "ConsumableKind" NOT NULL,
    "name" TEXT NOT NULL,
    "spec" JSONB,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "minQty" DOUBLE PRECISION,
    "location" TEXT,
    "lot" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revisionId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Consumable_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Consumable_kind_idx" ON "Consumable"("kind");
ALTER TABLE "Consumable" ADD CONSTRAINT "Consumable_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BomRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
