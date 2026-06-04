-- M1: Extend Org with partner-identity columns. Pure additive; no row touches.
-- Backs the MapPartner → Org consolidation. Read state in
-- scripts/_inspect-partner-current-state.ts; backfill in
-- scripts/backfill-partner-orgs.ts.

ALTER TABLE "Org"
  ADD COLUMN "color"        TEXT DEFAULT '#6366f1',
  ADD COLUMN "mapKey"       TEXT,
  ADD COLUMN "contactName"  TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "contactEmail" TEXT,
  ADD COLUMN "notes"        TEXT,
  ADD COLUMN "archivedAt"   TIMESTAMP(3);

-- mapKey is the legacy LAYERS slug used to colorise map polygons.
-- Unique across Orgs but nullable (internal orgs and any partner without
-- its own map layer leave it null).
CREATE UNIQUE INDEX "Org_mapKey_key" ON "Org" ("mapKey");
