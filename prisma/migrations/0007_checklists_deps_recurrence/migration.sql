-- Recurrence enum + field on Goal
CREATE TYPE "Recurrence" AS ENUM ('None', 'Weekly', 'Monthly', 'Quarterly', 'Yearly');
ALTER TABLE "Goal" ADD COLUMN "recurrence" "Recurrence" NOT NULL DEFAULT 'None';

-- Checklist items
CREATE TABLE "ChecklistItem" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "pitstopId" TEXT NOT NULL,
  "text"      TEXT NOT NULL,
  "checked"   BOOLEAN NOT NULL DEFAULT false,
  "order"     INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChecklistItem_pitstopId_fkey" FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Pitstop dependencies
CREATE TABLE "PitstopDependency" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "blockedId"   TEXT NOT NULL,
  "blockedById" TEXT NOT NULL,
  CONSTRAINT "PitstopDependency_blockedId_fkey"   FOREIGN KEY ("blockedId")   REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PitstopDependency_blockedById_fkey" FOREIGN KEY ("blockedById") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PitstopDependency_blockedId_blockedById_key" ON "PitstopDependency"("blockedId","blockedById");
