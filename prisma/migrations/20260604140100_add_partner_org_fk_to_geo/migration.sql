-- M2: Add partnerOrgId FK to Settlement, Cluster, LayerFeature.
-- Legacy columns (Settlement.partnerId → MapPartner, LayerFeature.partner
-- free-text) stay in place during the transition. Drop step happens in a
-- later migration after the backfill verification + code switchover.

ALTER TABLE "Settlement"
  ADD COLUMN "partnerOrgId" TEXT;
ALTER TABLE "Settlement"
  ADD CONSTRAINT "Settlement_partnerOrgId_fkey"
  FOREIGN KEY ("partnerOrgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Settlement_partnerOrgId_idx" ON "Settlement" ("partnerOrgId");

ALTER TABLE "Cluster"
  ADD COLUMN "partnerOrgId" TEXT;
ALTER TABLE "Cluster"
  ADD CONSTRAINT "Cluster_partnerOrgId_fkey"
  FOREIGN KEY ("partnerOrgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Cluster_partnerOrgId_idx" ON "Cluster" ("partnerOrgId");

ALTER TABLE "LayerFeature"
  ADD COLUMN "partnerOrgId" TEXT;
ALTER TABLE "LayerFeature"
  ADD CONSTRAINT "LayerFeature_partnerOrgId_fkey"
  FOREIGN KEY ("partnerOrgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "LayerFeature_partnerOrgId_idx" ON "LayerFeature" ("partnerOrgId");
