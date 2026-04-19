-- Add isHealthCluster to Cluster
ALTER TABLE "Cluster" ADD COLUMN IF NOT EXISTS "isHealthCluster" BOOLEAN NOT NULL DEFAULT false;

-- Health centres table
CREATE TABLE "HealthCentre" (
  "id"         TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "lat"        DOUBLE PRECISION NOT NULL,
  "lng"        DOUBLE PRECISION NOT NULL,
  "centreType" TEXT        NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "HealthCentre_pkey" PRIMARY KEY ("id")
);

-- Settlement ↔ HealthCentre junction
CREATE TABLE "SettlementHealthCentre" (
  "id"             TEXT             NOT NULL,
  "settlementId"   TEXT             NOT NULL,
  "healthCentreId" TEXT             NOT NULL,
  "distanceKm"     DOUBLE PRECISION NOT NULL,
  CONSTRAINT "SettlementHealthCentre_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementHealthCentre_settlementId_healthCentreId_key"
  ON "SettlementHealthCentre"("settlementId", "healthCentreId");

ALTER TABLE "SettlementHealthCentre"
  ADD CONSTRAINT "SettlementHealthCentre_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SettlementHealthCentre"
  ADD CONSTRAINT "SettlementHealthCentre_healthCentreId_fkey"
  FOREIGN KEY ("healthCentreId") REFERENCES "HealthCentre"("id") ON DELETE CASCADE ON UPDATE CASCADE;
