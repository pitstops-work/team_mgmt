-- Fix: approved budgets couldn't be deleted.
-- BudgetReallocationRequest.fromLineId/toLineId referenced BudgetLine with no
-- ON DELETE action (NO ACTION), so cascading a budget delete down to its lines
-- was blocked whenever a reallocation request existed (only on report-stage /
-- approved budgets). Make fromLine cascade (request is meaningless without its
-- source line/budget) and toLine set-null (destination is optional).

ALTER TABLE "BudgetReallocationRequest"
  DROP CONSTRAINT "BudgetReallocationRequest_fromLineId_fkey";
ALTER TABLE "BudgetReallocationRequest"
  ADD CONSTRAINT "BudgetReallocationRequest_fromLineId_fkey"
  FOREIGN KEY ("fromLineId") REFERENCES "BudgetLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BudgetReallocationRequest"
  DROP CONSTRAINT "BudgetReallocationRequest_toLineId_fkey";
ALTER TABLE "BudgetReallocationRequest"
  ADD CONSTRAINT "BudgetReallocationRequest_toLineId_fkey"
  FOREIGN KEY ("toLineId") REFERENCES "BudgetLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
