-- Add civicGroup column to NeedsFormulaConfig
ALTER TABLE "NeedsFormulaConfig" ADD COLUMN IF NOT EXISTS "civicGroup" TEXT;

-- Create SettlementCivicData table
CREATE TABLE IF NOT EXISTS "SettlementCivicData" (
  "settlementId"         TEXT NOT NULL,
  "janaId"               INTEGER,
  "borewell"             JSONB,
  "toiletConnection"     JSONB,
  "toiletFacility"       JSONB,
  "waterSupply"          JSONB,
  "borewellNeedScore"    DOUBLE PRECISION,
  "toiletConnNeedScore"  DOUBLE PRECISION,
  "toiletFacNeedScore"   DOUBLE PRECISION,
  "waterSupplyNeedScore" DOUBLE PRECISION,
  "syncedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "SettlementCivicData_pkey" PRIMARY KEY ("settlementId"),
  CONSTRAINT "SettlementCivicData_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE
);
