-- AlterTable
ALTER TABLE "Cart" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "bomLineId" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "excessListingId" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "Part" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'seed';

-- AlterTable
ALTER TABLE "PurchaseOrderDraft" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rfqId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "leadTimeWeeks" INTEGER,
ADD COLUMN     "quoteLineId" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "freight" DECIMAL(14,2),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "awarded" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Rfq" ADD COLUMN     "incoterm" TEXT;

-- AlterTable
ALTER TABLE "RfqLine" ADD COLUMN     "note" TEXT,
ADD COLUMN     "preferredSupplierId" TEXT;

-- CreateTable
CREATE TABLE "ApiCache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiCache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "stats" JSONB,
    "error" TEXT,
    "startedBy" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcingEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "supplierId" TEXT,
    "data" JSONB NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourcingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HsnDutyRate" (
    "prefix" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bcdPct" DECIMAL(5,2) NOT NULL,
    "swsPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "igstPct" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HsnDutyRate_pkey" PRIMARY KEY ("prefix")
);

-- CreateIndex
CREATE INDEX "ApiCache_expiresAt_idx" ON "ApiCache"("expiresAt");

-- CreateIndex
CREATE INDEX "JobRun_kind_startedAt_idx" ON "JobRun"("kind", "startedAt");

-- CreateIndex
CREATE INDEX "SourcingEvent_createdAt_idx" ON "SourcingEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_rfqId_supplierId_key" ON "Quote"("rfqId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteLine_quoteId_rfqLineId_key" ON "QuoteLine"("quoteId", "rfqLineId");

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderDraft" ADD CONSTRAINT "PurchaseOrderDraft_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_quoteLineId_fkey" FOREIGN KEY ("quoteLineId") REFERENCES "QuoteLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingEvent" ADD CONSTRAINT "SourcingEvent_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcingEvent" ADD CONSTRAINT "SourcingEvent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

