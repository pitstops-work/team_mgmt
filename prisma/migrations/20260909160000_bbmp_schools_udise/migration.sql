-- Rebuild BbmpSchool around the UDISE+ code.
--
-- The previous migration (20260909120000_bbmp_schools) was populated from a KML
-- that turned out to be Bangalore-district PRIMARY schools (mostly Education
-- Department), not BBMP schools. Those 1885 rows are discarded here; the table
-- is repopulated from UDISE+ "Know Your School" filtered to management =
-- "Local body". Nothing else references these tables, so a drop/recreate is
-- cleaner than migrating rows that were wrong to begin with.

DROP TABLE IF EXISTS "SettlementBbmpSchool";
DROP TABLE IF EXISTS "BbmpSchool";

CREATE TABLE "BbmpSchool" (
  "id"             TEXT             NOT NULL,
  "udiseCode"      TEXT             NOT NULL,
  "name"           TEXT             NOT NULL,
  "lat"            DOUBLE PRECISION,
  "lng"            DOUBLE PRECISION,
  "geocodeSource"  TEXT,
  "category"       TEXT,
  "management"     TEXT,
  "urbanLocalBody" TEXT,
  "lgdWard"        TEXT,
  "eduBlock"       TEXT,
  "eduDistrict"    TEXT,
  "address"        TEXT,
  "pincode"        TEXT,
  "status"         TEXT,
  "createdAt"      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  CONSTRAINT "BbmpSchool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BbmpSchool_udiseCode_key" ON "BbmpSchool"("udiseCode");

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
