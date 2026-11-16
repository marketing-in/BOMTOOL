-- AlterEnum
ALTER TYPE "SupplierKind" ADD VALUE 'CHANNEL_PARTNER';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "capabilities" JSONB,
ADD COLUMN     "supplies" TEXT[] DEFAULT ARRAY['components']::TEXT[];

-- AlterTable
ALTER TABLE "ExcessListing" ADD COLUMN     "leadDays" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseOrderDraft" ADD COLUMN     "services" JSONB;

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "thread" TEXT NOT NULL,
    "userId" TEXT,
    "author" TEXT NOT NULL,
    "fromSeller" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Message_thread_createdAt_idx" ON "Message"("thread", "createdAt");

