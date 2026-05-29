-- Phase 3 — RP reschedule tracking + manager pattern-alerts.
-- Adds the columns needed for the new RescheduleSheet UX and the
-- ActivityRescheduled notification type the API will emit when the
-- reschedule pattern policy says the manager should hear about it.

-- ── NotificationType: ActivityRescheduled ──────────────────────────────────
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ActivityRescheduled';

-- ── PitstopEvent: reschedule provenance ────────────────────────────────────
-- `rescheduleCount` increments on each PATCH-with-reschedule. UI uses it to
-- badge chronic slippage ("Rescheduled 3×") and the notify-policy treats
-- count >= 2 as an overlay trigger that always escalates.
ALTER TABLE "PitstopEvent" ADD COLUMN IF NOT EXISTS "rescheduleCount" INTEGER NOT NULL DEFAULT 0;

-- `rescheduleReasonCode` is the chip the RP picked in the RescheduleSheet
-- (desk_work | double_booked | weather | team_meeting | other). The free-text
-- `rescheduleReason` column already exists — that captures the "Other" detail.
-- Stored as a plain text column rather than a Postgres enum so adding new
-- chips doesn't require another migration.
ALTER TABLE "PitstopEvent" ADD COLUMN IF NOT EXISTS "rescheduleReasonCode" TEXT;
