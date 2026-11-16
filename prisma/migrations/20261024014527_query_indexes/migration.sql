-- CreateIndex
CREATE INDEX "BomLine_partId_idx" ON "BomLine"("partId");

-- CreateIndex
CREATE INDEX "Offer_supplierId_idx" ON "Offer"("supplierId");

-- CreateIndex
CREATE INDEX "Placement_bomLineId_idx" ON "Placement"("bomLineId");

-- CreateIndex
CREATE INDEX "SourcingEvent_partId_idx" ON "SourcingEvent"("partId");

-- CreateIndex
CREATE INDEX "SourcingEvent_acknowledged_idx" ON "SourcingEvent"("acknowledged");

