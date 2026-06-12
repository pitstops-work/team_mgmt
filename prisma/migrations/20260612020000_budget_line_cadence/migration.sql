-- BudgetLine: timing profile for period-budget apportionment in reports.
--   monthly  → straight-line yearTotal/12 × monthsInPeriod (default, prior behaviour).
--   one_time → full yearTotal lands in plannedMonths[0] (1..12 of grant year).
--   seasonal → yearTotal split evenly across plannedMonths (≥ 2 entries).
--
-- New budgets only. Existing rows default to "monthly" with an empty
-- plannedMonths array — preserving today's apportionment so historical
-- reports do not shift.

CREATE TYPE "BudgetLineCadence" AS ENUM ('monthly', 'one_time', 'seasonal');

ALTER TABLE "BudgetLine"
  ADD COLUMN "cadence"       "BudgetLineCadence" NOT NULL DEFAULT 'monthly',
  ADD COLUMN "plannedMonths" INTEGER[]           NOT NULL DEFAULT '{}';
