-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PURCHASING', 'ENGINEERING', 'PLANNING', 'STORES', 'QUALITY', 'VIEWER');

-- CreateEnum
CREATE TYPE "Lifecycle" AS ENUM ('ACTIVE', 'NRND', 'LAST_TIME_BUY', 'EOL', 'OBSOLETE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Condition" AS ENUM ('NEW_FACTORY_SEALED', 'NEW_OPEN_REEL', 'NEW_PARTIAL', 'REFURBISHED', 'USED');

-- CreateEnum
CREATE TYPE "RohsStatus" AS ENUM ('COMPLIANT', 'COMPLIANT_WITH_EXEMPTION', 'NON_COMPLIANT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReachStatus" AS ENUM ('COMPLIANT', 'CONTAINS_SVHC', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SupplierKind" AS ENUM ('INTERNAL_STOCK', 'CONSIGNED', 'OWN_EXCESS', 'PARTNER_EXCESS', 'AUTHORISED', 'MANUFACTURER', 'BROKER');

-- CreateEnum
CREATE TYPE "Msl" AS ENUM ('MSL_1', 'MSL_2', 'MSL_2A', 'MSL_3', 'MSL_4', 'MSL_5', 'MSL_5A', 'MSL_6');

-- CreateEnum
CREATE TYPE "MountType" AS ENUM ('SMD', 'THT', 'PRESS_FIT', 'CHASSIS', 'CABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('PROTOTYPE', 'NPI', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "BomStatus" AS ENUM ('DRAFT', 'MAPPED', 'MATCHED', 'QUOTED', 'RELEASED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('EXACT', 'NORMALISED', 'FUZZY', 'PARAMETRIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "AlternateType" AS ENUM ('DROP_IN', 'PIN_TO_PIN', 'FUNCTIONAL', 'UPGRADE');

-- CreateEnum
CREATE TYPE "RfqStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_QUOTED', 'QUOTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PoStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LineType" AS ENUM ('SMT', 'THT', 'BOX_BUILD', 'MIXED');

-- CreateEnum
CREATE TYPE "MachineType" AS ENUM ('BOARD_LOADER', 'STENCIL_PRINTER', 'SPI', 'PICK_AND_PLACE', 'REFLOW_OVEN', 'AOI', 'XRAY', 'WAVE_SOLDER', 'SELECTIVE_SOLDER', 'DEPANELER', 'CONFORMAL_COATER', 'ICT', 'FLYING_PROBE', 'FCT', 'WASHER', 'PRESS_FIT', 'SCREWDRIVER_STATION', 'PACKING', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('PLANNED', 'KITTING', 'READY', 'IN_PROGRESS', 'ON_HOLD', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KnowledgeDomain" AS ENUM ('PCB', 'PCBA', 'BOX_BUILD', 'COMPONENT', 'PACKAGE', 'STANDARD', 'PROCESS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "website" TEXT,
    "country" TEXT,
    "brandTier" INTEGER NOT NULL DEFAULT 3,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturerAlias" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,

    CONSTRAINT "ManufacturerAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "attritionPct" DECIMAL(5,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parameter" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'number',
    "categoryId" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Parameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartParameter" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "parameterId" TEXT NOT NULL,
    "valueText" TEXT NOT NULL,
    "valueNum" DOUBLE PRECISION,

    CONSTRAINT "PartParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "mountType" "MountType" NOT NULL DEFAULT 'SMD',
    "pinCount" INTEGER,
    "pitchMm" DOUBLE PRECISION,
    "lengthMm" DOUBLE PRECISION,
    "widthMm" DOUBLE PRECISION,
    "heightMm" DOUBLE PRECISION,
    "attritionPct" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "ipc7351Name" TEXT,
    "model3dUrl" TEXT,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "mpn" TEXT NOT NULL,
    "mpnNormalised" TEXT NOT NULL,
    "manufacturerId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "packageId" TEXT,
    "description" TEXT NOT NULL,
    "datasheetUrl" TEXT,
    "imageUrl" TEXT,
    "lifecycle" "Lifecycle" NOT NULL DEFAULT 'ACTIVE',
    "lifecycleUpdatedAt" TIMESTAMP(3),
    "introducedYear" INTEGER,
    "rohs" "RohsStatus" NOT NULL DEFAULT 'UNKNOWN',
    "reach" "ReachStatus" NOT NULL DEFAULT 'UNKNOWN',
    "conflictMineralsDeclared" BOOLEAN NOT NULL DEFAULT false,
    "hsnCode" TEXT,
    "eccn" TEXT,
    "countryOfOrigin" TEXT,
    "msl" "Msl",
    "mountType" "MountType" NOT NULL DEFAULT 'SMD',
    "mfrLeadTimeWeeks" INTEGER,
    "counterfeitRisk" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alternate" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "altPartId" TEXT NOT NULL,
    "type" "AlternateType" NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 80,
    "notes" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "Alternate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "SupplierKind" NOT NULL,
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "website" TEXT,
    "adapter" TEXT,
    "isAuthorised" BOOLEAN NOT NULL DEFAULT false,
    "freightPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "contactEmail" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "sku" TEXT,
    "packaging" TEXT,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "moq" INTEGER NOT NULL DEFAULT 1,
    "spq" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "priceBreaks" JSONB NOT NULL,
    "factoryLeadTimeWeeks" INTEGER,
    "condition" "Condition" NOT NULL DEFAULT 'NEW_FACTORY_SEALED',
    "dateCode" TEXT,
    "cocAvailable" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "supplierId" TEXT,
    "unitPrice" DECIMAL(14,6) NOT NULL,
    "currency" TEXT NOT NULL,
    "refQty" INTEGER NOT NULL DEFAULT 1000,
    "stock" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "hasDryStorage" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryLot" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "bin" TEXT NOT NULL,
    "lotCode" TEXT,
    "reelId" TEXT,
    "qty" INTEGER NOT NULL,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "dateCode" TEXT,
    "condition" "Condition" NOT NULL DEFAULT 'NEW_FACTORY_SEALED',
    "msl" "Msl",
    "mslOpenedAt" TIMESTAMP(3),
    "floorLifeHoursLeft" DOUBLE PRECISION,
    "isConsigned" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT,
    "unitCost" DECIMAL(14,6),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "cocOnFile" BOOLEAN NOT NULL DEFAULT false,
    "countryOfOrigin" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExcessListing" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "askPrice" DECIMAL(14,6),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "dateCode" TEXT,
    "condition" "Condition" NOT NULL DEFAULT 'NEW_OPEN_REEL',
    "cocAvailable" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "acceptsBids" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcessListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "bomTemplates" JSONB,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stage" "ProjectStage" NOT NULL DEFAULT 'PROTOTYPE',
    "boardSpec" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bom" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assemblyPartNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomRevision" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "status" "BomStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceFileName" TEXT,
    "columnMapping" JSONB,
    "buildQty" INTEGER NOT NULL DEFAULT 100,
    "notes" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BomRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomLine" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "rawMpn" TEXT,
    "rawManufacturer" TEXT,
    "rawDescription" TEXT,
    "rawPackage" TEXT,
    "refDes" TEXT,
    "qtyPerBoard" INTEGER NOT NULL,
    "dnp" BOOLEAN NOT NULL DEFAULT false,
    "customerPartNumber" TEXT,
    "issues" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "partId" TEXT,
    "scoreAvailability" INTEGER,
    "scoreResilience" INTEGER,
    "scoreQuality" INTEGER,
    "scoreEconomic" INTEGER,
    "scoreSustainability" INTEGER,

    CONSTRAINT "BomLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BomLineMatch" (
    "id" TEXT NOT NULL,
    "bomLineId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "selected" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BomLineMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bomRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "offerId" TEXT,
    "isBid" BOOLEAN NOT NULL DEFAULT false,
    "bidPrice" DECIMAL(14,6),
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rfq" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "RfqStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rfq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqLine" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "targetPrice" DECIMAL(14,6),
    "currency" TEXT NOT NULL DEFAULT 'INR',

    CONSTRAINT "RfqLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "rfqId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3),
    "currency" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "rfqLineId" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,6) NOT NULL,
    "qtyOffered" INTEGER NOT NULL,
    "leadTimeWeeks" INTEGER,
    "dateCode" TEXT,
    "condition" "Condition" NOT NULL DEFAULT 'NEW_FACTORY_SEALED',
    "cocAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderDraft" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "status" "PoStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL,
    "costBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,6) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Line" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LineType" NOT NULL,
    "description" TEXT,
    "capability" JSONB NOT NULL,
    "capacityCph" INTEGER,
    "feederSlots" INTEGER,
    "shiftsPerDay" INTEGER NOT NULL DEFAULT 2,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Machine" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "type" "MachineType" NOT NULL,
    "vendor" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "specs" JSONB,

    CONSTRAINT "Machine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "bomRevisionId" TEXT NOT NULL,
    "lineId" TEXT,
    "buildQty" INTEGER NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'PLANNED',
    "clearToBuildPct" INTEGER,
    "plannedStart" TIMESTAMP(3),
    "plannedEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" "KnowledgeDomain" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RfqToSupplier" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RfqToSupplier_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturerAlias_alias_key" ON "ManufacturerAlias"("alias");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Parameter_key_categoryId_key" ON "Parameter"("key", "categoryId");

-- CreateIndex
CREATE INDEX "PartParameter_parameterId_valueNum_idx" ON "PartParameter"("parameterId", "valueNum");

-- CreateIndex
CREATE UNIQUE INDEX "PartParameter_partId_parameterId_key" ON "PartParameter"("partId", "parameterId");

-- CreateIndex
CREATE UNIQUE INDEX "Package_name_key" ON "Package"("name");

-- CreateIndex
CREATE INDEX "Part_mpnNormalised_idx" ON "Part"("mpnNormalised");

-- CreateIndex
CREATE INDEX "Part_categoryId_idx" ON "Part"("categoryId");

-- CreateIndex
CREATE INDEX "Part_lifecycle_idx" ON "Part"("lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "Part_mpnNormalised_manufacturerId_key" ON "Part"("mpnNormalised", "manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "Alternate_partId_altPartId_key" ON "Alternate"("partId", "altPartId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE INDEX "Offer_partId_idx" ON "Offer"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_partId_supplierId_sku_key" ON "Offer"("partId", "supplierId", "sku");

-- CreateIndex
CREATE INDEX "PriceHistory_partId_recordedAt_idx" ON "PriceHistory"("partId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryLot_reelId_key" ON "InventoryLot"("reelId");

-- CreateIndex
CREATE INDEX "InventoryLot_partId_idx" ON "InventoryLot"("partId");

-- CreateIndex
CREATE INDEX "ExcessListing_partId_idx" ON "ExcessListing"("partId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BomRevision_bomId_revision_key" ON "BomRevision"("bomId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "BomLine_revisionId_lineNo_key" ON "BomLine"("revisionId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "BomLineMatch_bomLineId_partId_key" ON "BomLineMatch"("bomLineId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "Rfq_number_key" ON "Rfq"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderDraft_number_key" ON "PurchaseOrderDraft"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Line_code_key" ON "Line"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Machine_lineId_position_key" ON "Machine"("lineId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");

-- CreateIndex
CREATE INDEX "_RfqToSupplier_B_index" ON "_RfqToSupplier"("B");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturerAlias" ADD CONSTRAINT "ManufacturerAlias_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parameter" ADD CONSTRAINT "Parameter_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartParameter" ADD CONSTRAINT "PartParameter_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartParameter" ADD CONSTRAINT "PartParameter_parameterId_fkey" FOREIGN KEY ("parameterId") REFERENCES "Parameter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Part" ADD CONSTRAINT "Part_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alternate" ADD CONSTRAINT "Alternate_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alternate" ADD CONSTRAINT "Alternate_altPartId_fkey" FOREIGN KEY ("altPartId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLot" ADD CONSTRAINT "InventoryLot_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessListing" ADD CONSTRAINT "ExcessListing_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExcessListing" ADD CONSTRAINT "ExcessListing_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bom" ADD CONSTRAINT "Bom_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomRevision" ADD CONSTRAINT "BomRevision_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "Bom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomRevision" ADD CONSTRAINT "BomRevision_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "BomRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLine" ADD CONSTRAINT "BomLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLineMatch" ADD CONSTRAINT "BomLineMatch_bomLineId_fkey" FOREIGN KEY ("bomLineId") REFERENCES "BomLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BomLineMatch" ADD CONSTRAINT "BomLineMatch_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_bomRevisionId_fkey" FOREIGN KEY ("bomRevisionId") REFERENCES "BomRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rfq" ADD CONSTRAINT "Rfq_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqLine" ADD CONSTRAINT "RfqLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_rfqLineId_fkey" FOREIGN KEY ("rfqLineId") REFERENCES "RfqLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderDraft" ADD CONSTRAINT "PurchaseOrderDraft_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrderDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Machine" ADD CONSTRAINT "Machine_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_bomRevisionId_fkey" FOREIGN KEY ("bomRevisionId") REFERENCES "BomRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "Line"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RfqToSupplier" ADD CONSTRAINT "_RfqToSupplier_A_fkey" FOREIGN KEY ("A") REFERENCES "Rfq"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RfqToSupplier" ADD CONSTRAINT "_RfqToSupplier_B_fkey" FOREIGN KEY ("B") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
