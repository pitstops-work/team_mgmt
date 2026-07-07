-- Cost registry provenance, both dimensions:
--   CostRegistryHistory   — temporal: append-only change log per unit cost.
--   CostRegistryComponent — structural: breakup of an aggregate item.
-- Both additive; no existing data touched. FK-by-convention on itemKey (no DB
-- FK) since CostRegistry's natural key is (city, itemKey), not id.

CREATE TABLE "CostRegistryHistory" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "domain" TEXT,
    "itemKey" TEXT NOT NULL,
    "oldCost" DOUBLE PRECISION,
    "newCost" DOUBLE PRECISION,
    "source" TEXT,
    "reason" TEXT,
    "changedById" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostRegistryHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CostRegistryHistory_city_itemKey_changedAt_idx"
  ON "CostRegistryHistory"("city", "itemKey", "changedAt");

CREATE TABLE "CostRegistryComponent" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "parentItemKey" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "spec" TEXT,
    "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CostRegistryComponent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CostRegistryComponent_city_parentItemKey_position_idx"
  ON "CostRegistryComponent"("city", "parentItemKey", "position");
