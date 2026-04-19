-- Create School table for government schools mapped to settlements
CREATE TABLE "School" (
  "id"        TEXT        NOT NULL,
  "name"      TEXT        NOT NULL,
  "lat"       DOUBLE PRECISION NOT NULL,
  "lng"       DOUBLE PRECISION NOT NULL,
  "address"   TEXT,
  "gmapsId"   TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "School_gmapsId_key" ON "School"("gmapsId");

-- Junction table: settlement ↔ school with haversine distance
CREATE TABLE "SettlementSchool" (
  "id"           TEXT             NOT NULL,
  "settlementId" TEXT             NOT NULL,
  "schoolId"     TEXT             NOT NULL,
  "distanceKm"   DOUBLE PRECISION NOT NULL,
  CONSTRAINT "SettlementSchool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementSchool_settlementId_schoolId_key"
  ON "SettlementSchool"("settlementId", "schoolId");

ALTER TABLE "SettlementSchool"
  ADD CONSTRAINT "SettlementSchool_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SettlementSchool"
  ADD CONSTRAINT "SettlementSchool_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
