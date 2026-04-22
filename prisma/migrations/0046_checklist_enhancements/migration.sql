-- Migration 0046: Checklist enhancements + activity linking
--
-- 1. Add ChecklistItemStatus enum
-- 2. Add status, assigneeId, notes, updatedAt to ChecklistItem
-- 3. Add checklistItemId FK to PitstopEvent (1:1 — one activity per checklist item)

-- ── ChecklistItemStatus enum ──────────────────────────────────────────────────

CREATE TYPE "ChecklistItemStatus" AS ENUM (
  'NotStarted',
  'Scheduled',
  'InProgress',
  'Done',
  'Blocked',
  'Rescheduled',
  'Cancelled'
);

-- ── ChecklistItem enhancements ────────────────────────────────────────────────

ALTER TABLE "ChecklistItem"
  ADD COLUMN "status"     "ChecklistItemStatus" NOT NULL DEFAULT 'NotStarted',
  ADD COLUMN "assigneeId" TEXT,
  ADD COLUMN "notes"      TEXT,
  ADD COLUMN "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ChecklistItem"
  ADD CONSTRAINT "ChecklistItem_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── PitstopEvent: link to triggering checklist item (optional, 1:1) ──────────

ALTER TABLE "PitstopEvent"
  ADD COLUMN "checklistItemId" TEXT UNIQUE;

ALTER TABLE "PitstopEvent"
  ADD CONSTRAINT "PitstopEvent_checklistItemId_fkey"
    FOREIGN KEY ("checklistItemId") REFERENCES "ChecklistItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
