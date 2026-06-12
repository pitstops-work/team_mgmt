-- Budget: per-budget cost customisation.
-- costOverrides : sparse delta map (itemKey → value) of user-edited rates.
-- costSnapshot  : full registry snapshot at create time. The generator merges
--                 overrides on top of the snapshot, insulating finalised
--                 budgets from later registry edits.
ALTER TABLE "Budget"
  ADD COLUMN "costOverrides" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "costSnapshot"  JSONB NOT NULL DEFAULT '{}';
