-- Add lifecycle fields to PitstopEvent
ALTER TABLE "PitstopEvent"
  ADD COLUMN IF NOT EXISTS "rescheduledFrom"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rescheduleReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "cancellationReason" TEXT;

-- Add Rescheduled to PitstopEventStatus enum
ALTER TYPE "PitstopEventStatus" ADD VALUE IF NOT EXISTS 'Rescheduled';
