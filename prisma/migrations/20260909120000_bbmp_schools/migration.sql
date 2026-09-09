-- Create BbmpSchool table (BBMP / municipal schools) mapped to settlements.
-- Separate dataset from the state "School" layer, mirroring IndiraCanteen.
CREATE TABLE "BbmpSchool" (
  "id"        TEXT             NOT NULL,
  "name"      TEXT             NOT NULL,
  "lat"       DOUBLE PRECISION NOT NULL,
  "lng"       DOUBLE PRECISION NOT NULL,
  "address"   TEXT,
  "sourceKey" TEXT             NOT NULL,
  "createdAt" TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  CONSTRAINT "BbmpSchool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BbmpSchool_sourceKey_key" ON "BbmpSchool"("sourceKey");

-- Junction table: settlement ↔ BBMP school with haversine distance
CREATE TABLE "SettlementBbmpSchool" (
  "id"           TEXT             NOT NULL,
  "settlementId" TEXT             NOT NULL,
  "schoolId"     TEXT             NOT NULL,
  "distanceKm"   DOUBLE PRECISION NOT NULL,
  CONSTRAINT "SettlementBbmpSchool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SettlementBbmpSchool_settlementId_schoolId_key"
  ON "SettlementBbmpSchool"("settlementId", "schoolId");

ALTER TABLE "SettlementBbmpSchool"
  ADD CONSTRAINT "SettlementBbmpSchool_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SettlementBbmpSchool"
  ADD CONSTRAINT "SettlementBbmpSchool_schoolId_fkey"
  FOREIGN KEY ("schoolId") REFERENCES "BbmpSchool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
