-- Migration 0031: Variance log, pitstop verify, goal confirm, reporting structure

-- 1. Reporting structure (for notification routing only — not a hard hierarchy)
ALTER TABLE "User" ADD COLUMN "reportsToId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_reportsToId_fkey"
  FOREIGN KEY ("reportsToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Pitstop peer verification
ALTER TABLE "Pitstop" ADD COLUMN "verifiedById" TEXT;
ALTER TABLE "Pitstop" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "Pitstop" ADD CONSTRAINT "Pitstop_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Goal confirmation
ALTER TABLE "Goal" ADD COLUMN "confirmedById" TEXT;
ALTER TABLE "Goal" ADD COLUMN "confirmedAt" TIMESTAMP(3);
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_confirmedById_fkey"
  FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Pitstop date change log (variance log)
CREATE TABLE "PitstopDateChange" (
  "id"          TEXT         NOT NULL,
  "pitstopId"   TEXT         NOT NULL,
  "field"       TEXT         NOT NULL DEFAULT 'targetDate',
  "oldDate"     TIMESTAMP(3) NOT NULL,
  "newDate"     TIMESTAMP(3) NOT NULL,
  "reason"      TEXT,
  "changedById" TEXT         NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PitstopDateChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PitstopDateChange_pitstopId_fkey"
    FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PitstopDateChange_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "PitstopDateChange_pitstopId_idx" ON "PitstopDateChange"("pitstopId");
