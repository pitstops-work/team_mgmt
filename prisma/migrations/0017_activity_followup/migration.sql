-- Add new NotificationType values
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PitstopStatusChange';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GoalFollowed';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ActivityTagged';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ActivityFollowup';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ActivityMorningNudge';

-- Add PitstopEventStatus enum
CREATE TYPE "PitstopEventStatus" AS ENUM ('Scheduled', 'Done', 'Cancelled', 'Flagged');

-- Add status column to PitstopEvent
ALTER TABLE "PitstopEvent" ADD COLUMN "status" "PitstopEventStatus" NOT NULL DEFAULT 'Scheduled';

-- Add PitstopEventFollowupStatus enum
CREATE TYPE "PitstopEventFollowupStatus" AS ENUM ('Done', 'No', 'Cancelled', 'Rescheduled');

-- Create PitstopEventFollowup table
CREATE TABLE "PitstopEventFollowup" (
  "id"          TEXT NOT NULL,
  "eventId"     TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "response"    "PitstopEventFollowupStatus",
  "sentAt"      TIMESTAMP(3) NOT NULL,
  "nudgeSentAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PitstopEventFollowup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PitstopEventFollowup"
  ADD CONSTRAINT "PitstopEventFollowup_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "PitstopEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PitstopEventFollowup"
  ADD CONSTRAINT "PitstopEventFollowup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PitstopEventFollowup_eventId_userId_key"
  ON "PitstopEventFollowup"("eventId", "userId");
