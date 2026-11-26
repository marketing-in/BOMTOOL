-- Phase 47: a distributor part number carried by the customer's BoM line, and the distributor it belongs to.
ALTER TABLE "BomLine" ADD COLUMN "supplierPn" TEXT;
ALTER TABLE "BomLine" ADD COLUMN "supplierName" TEXT;
