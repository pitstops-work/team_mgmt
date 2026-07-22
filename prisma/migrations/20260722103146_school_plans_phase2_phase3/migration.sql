-- Phase 2/3 additions to SchoolPlan:
--   - anchorPartnerId → GrantPartner (Phase 2 rewire, replaces free-text anchor)
--   - publicSlug + isInterimStructure + interimStructureSpec (Phase 3)

ALTER TABLE "SchoolPlan"
  ADD COLUMN "anchorPartnerId"      TEXT,
  ADD COLUMN "publicSlug"           TEXT,
  ADD COLUMN "isInterimStructure"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "interimStructureSpec" TEXT;

CREATE UNIQUE INDEX "SchoolPlan_publicSlug_key"      ON "SchoolPlan"("publicSlug");
CREATE INDEX        "SchoolPlan_anchorPartnerId_idx" ON "SchoolPlan"("anchorPartnerId");

ALTER TABLE "SchoolPlan"
  ADD CONSTRAINT "SchoolPlan_anchorPartnerId_fkey"
  FOREIGN KEY ("anchorPartnerId") REFERENCES "GrantPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
