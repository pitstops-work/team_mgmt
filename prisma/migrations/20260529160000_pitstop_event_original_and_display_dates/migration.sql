-- Phase 0 — PitstopEvent: originalScheduledAt + displayDate.
--
-- `originalScheduledAt` is frozen at creation and never mutated by reschedule,
-- so delay/SLA can be computed from the user's first commitment instead of
-- whatever the latest rescheduled-to date happens to be. Without this,
-- rescheduling silently launders lateness.
--
-- `displayDate` is a transient "also surface this activity on this day's
-- Today list" override. Set by the Add-to-today action (overdue pull-in
-- or future pull-forward). Never touches scheduledAt — the activity stays
-- where it lives; this is purely a list-visibility pointer. Old values
-- don't need clearing: the Today query only matches when displayDate = today.

-- Add as nullable first so we can backfill.
ALTER TABLE "PitstopEvent" ADD COLUMN IF NOT EXISTS "originalScheduledAt" TIMESTAMP(3);
ALTER TABLE "PitstopEvent" ADD COLUMN IF NOT EXISTS "displayDate" TIMESTAMP(3);

-- Backfill: all existing rows get originalScheduledAt = current scheduledAt.
-- Reschedule history is mostly test data (live app uptake has been recent
-- and slow), so we accept that already-rescheduled events lose their pre-
-- reschedule original. Going forward originalScheduledAt is set at insert
-- and immutable.
UPDATE "PitstopEvent" SET "originalScheduledAt" = "scheduledAt" WHERE "originalScheduledAt" IS NULL;

-- Lock in NOT NULL now that every row has a value.
ALTER TABLE "PitstopEvent" ALTER COLUMN "originalScheduledAt" SET NOT NULL;
