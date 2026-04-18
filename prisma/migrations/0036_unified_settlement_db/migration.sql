-- Migration 0036: Unified Settlement Database
-- Implements single source of truth for all geographic/settlement data.
-- Additive changes first, then destructive drops.

-- ── 1. Extend Settlement ─────────────────────────────────────────────────────

ALTER TABLE "Settlement"
  ADD COLUMN IF NOT EXISTS "polygon"     JSONB,
  ADD COLUMN IF NOT EXISTS "centroidLat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "centroidLng" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "partnerId"   TEXT REFERENCES "MapPartner"("id"),
  ADD COLUMN IF NOT EXISTS "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS "Settlement_partnerId_idx" ON "Settlement"("partnerId");

-- ── 2. SettlementProfile (flattened snapshot of latest assessment) ────────────

CREATE TABLE IF NOT EXISTS "SettlementProfile" (
  "settlementId"     TEXT         NOT NULL PRIMARY KEY,
  "totalHouseholds"  INTEGER      NOT NULL DEFAULT 0,
  "children6m3yr"    INTEGER      NOT NULL DEFAULT 0,
  "children4to14"    INTEGER      NOT NULL DEFAULT 0,
  "youth15to21"      INTEGER      NOT NULL DEFAULT 0,
  "elderly60plus"    INTEGER      NOT NULL DEFAULT 0,
  "settlementType"   TEXT,
  "priorityIssues"   TEXT,
  "lastAssessmentId" TEXT,
  "lastSyncedAt"     TIMESTAMP(3),
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  CONSTRAINT "SettlementProfile_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE
);

-- ── 3. Pitstop: add needs geography direct FKs ───────────────────────────────

ALTER TABLE "Pitstop"
  ADD COLUMN IF NOT EXISTS "needsSettlementId" TEXT REFERENCES "Settlement"("id"),
  ADD COLUMN IF NOT EXISTS "needsClusterId"    TEXT REFERENCES "Cluster"("id"),
  ADD COLUMN IF NOT EXISTS "needsZoneId"       TEXT REFERENCES "Zone"("id");

CREATE INDEX IF NOT EXISTS "Pitstop_needsSettlementId_idx" ON "Pitstop"("needsSettlementId");
CREATE INDEX IF NOT EXISTS "Pitstop_needsClusterId_idx"    ON "Pitstop"("needsClusterId");
CREATE INDEX IF NOT EXISTS "Pitstop_needsZoneId_idx"       ON "Pitstop"("needsZoneId");

-- ── 4. SettlementNote: migrate from name-string PK to settlementId FK ────────
-- Old schema: settlement TEXT @id  (settlement name as PK)
-- New schema: settlementId TEXT @id (FK to Settlement.id)
-- We rename the column and wire up the FK.
-- NOTE: Run scripts/fix-settlement-notes.ts BEFORE applying the NOT NULL constraint.

ALTER TABLE "SettlementNote" RENAME COLUMN "settlement" TO "settlementId";

-- After data migration script has run, add the FK:
-- ALTER TABLE "SettlementNote"
--   ADD CONSTRAINT "SettlementNote_settlementId_fkey"
--   FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE;
-- (run via scripts/fix-settlement-notes.ts or manually after verification)

-- ── 5. MapFeature: add optional settlementId FK ──────────────────────────────

ALTER TABLE "MapFeature"
  ADD COLUMN IF NOT EXISTS "settlementId" TEXT REFERENCES "Settlement"("id");

CREATE INDEX IF NOT EXISTS "MapFeature_settlementId_idx" ON "MapFeature"("settlementId");

-- ── 6. Drop M2M junction tables (geography tags — replaced by direct FKs) ───

DROP TABLE IF EXISTS "GoalSettlement";
DROP TABLE IF EXISTS "GoalCluster";
DROP TABLE IF EXISTS "GoalZone";
DROP TABLE IF EXISTS "GoalCity";
DROP TABLE IF EXISTS "PitstopSettlement";
DROP TABLE IF EXISTS "PitstopCluster";
DROP TABLE IF EXISTS "PitstopZone";
DROP TABLE IF EXISTS "PitstopCity";
