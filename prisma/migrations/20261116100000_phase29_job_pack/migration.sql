-- Phase 29: what was read from an uploaded job pack (sheets, placements, not-fitted designators, findings).
ALTER TABLE "BomRevision" ADD COLUMN "pack" JSONB;
