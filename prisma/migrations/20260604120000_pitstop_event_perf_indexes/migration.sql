-- Indexes to back the /activities page's date-window + active-events queries.
-- See [[visit-scheduling]] perf section. EXPLAIN ANALYZE on 2026-06-04 showed
-- Seq Scan on both PitstopEvent (filtering 13k rows for active+non-cancelled)
-- and a quicksort by scheduledAt with no supporting index — fine for today's
-- ~4k row table but degrades linearly.

-- Sort + range index. Bulk of activities-page queries are
--   "scheduledAt between X and Y, ordered by scheduledAt asc".
CREATE INDEX IF NOT EXISTS "PitstopEvent_scheduledAt_idx"
  ON "PitstopEvent" ("scheduledAt");

-- Partial index for the active-list filter the activities page uses.
-- Postgres can scan only the rows matching the predicate, which is the
-- vast majority of common reads.
CREATE INDEX IF NOT EXISTS "PitstopEvent_active_scheduledAt_idx"
  ON "PitstopEvent" ("scheduledAt")
  WHERE "deletedAt" IS NULL
    AND status != 'Cancelled'::"PitstopEventStatus";
