-- Pitstop recurrence
CREATE TYPE "PitstopRecurrence" AS ENUM ('None', 'Weekly', 'Monthly', 'Quarterly');
ALTER TABLE "Pitstop" ADD COLUMN "recurrence" "PitstopRecurrence" NOT NULL DEFAULT 'None';

-- One-shot reminder log (10d / 3d / due) — one row per pitstop+type
CREATE TABLE "PitstopReminderLog" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "pitstopId" TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PitstopReminderLog_pitstopId_fkey" FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PitstopReminderLog_pitstopId_type_key" ON "PitstopReminderLog"("pitstopId", "type");

-- Check-in log — one row per pitstop, updated each time
CREATE TABLE "PitstopCheckinLog" (
  "id"         TEXT NOT NULL PRIMARY KEY,
  "pitstopId"  TEXT NOT NULL,
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PitstopCheckinLog_pitstopId_fkey" FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PitstopCheckinLog_pitstopId_key" ON "PitstopCheckinLog"("pitstopId");

-- Pitstop event type
CREATE TYPE "PitstopEventType" AS ENUM ('Meeting', 'Visit', 'Event');

-- Schedulable meetings / visits / events
CREATE TABLE "PitstopEvent" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "type"        "PitstopEventType" NOT NULL DEFAULT 'Meeting',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "location"    TEXT,
  "pitstopId"   TEXT,
  "createdById" TEXT NOT NULL,
  "deletedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PitstopEvent_pitstopId_fkey"   FOREIGN KEY ("pitstopId")   REFERENCES "Pitstop"("id") ON DELETE SET NULL,
  CONSTRAINT "PitstopEvent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id")
);
