-- Real start and finish of a work order, for line running times (Part 1, line fit).
ALTER TABLE "WorkOrder" ADD COLUMN "startedAt" TIMESTAMP(3);
ALTER TABLE "WorkOrder" ADD COLUMN "finishedAt" TIMESTAMP(3);
