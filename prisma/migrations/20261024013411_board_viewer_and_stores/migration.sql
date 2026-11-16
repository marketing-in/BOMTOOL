-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "BoardModel" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'spec',
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
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "refDes" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "side" TEXT NOT NULL DEFAULT 'TOP',
    "footprint" TEXT,
    "value" TEXT,
    "bomLineId" TEXT,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "lotId" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "workOrderId" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "bomLineId" TEXT,
    "qty" INTEGER NOT NULL,
    "issued" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardModel_revisionId_key" ON "BoardModel"("revisionId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_revisionId_refDes_key" ON "Placement"("revisionId", "refDes");

-- CreateIndex
CREATE INDEX "StockMovement_partId_createdAt_idx" ON "StockMovement"("partId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_lotId_idx" ON "StockMovement"("lotId");

-- CreateIndex
CREATE INDEX "Reservation_workOrderId_idx" ON "Reservation"("workOrderId");

-- CreateIndex
CREATE INDEX "Reservation_lotId_idx" ON "Reservation"("lotId");

-- AddForeignKey
ALTER TABLE "BoardModel" ADD CONSTRAINT "BoardModel_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_bomLineId_fkey" FOREIGN KEY ("bomLineId") REFERENCES "BomLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "InventoryLot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

