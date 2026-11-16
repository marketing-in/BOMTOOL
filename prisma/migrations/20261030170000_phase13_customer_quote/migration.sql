-- CreateTable
CREATE TABLE "CustomerQuote" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "revisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "board" JSONB,
    "lines" JSONB,
    "box" JSONB,
    "quantities" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "rates" JSONB,
    "snapshot" JSONB,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "validDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "createdById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerQuote_number_key" ON "CustomerQuote"("number");

-- CreateIndex
CREATE INDEX "CustomerQuote_revisionId_status_idx" ON "CustomerQuote"("revisionId", "status");

-- AddForeignKey
ALTER TABLE "CustomerQuote" ADD CONSTRAINT "CustomerQuote_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

