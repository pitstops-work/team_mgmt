-- Stable binding identifier on ChecklistItem.
-- Populated at goal-from-template apply time; used with ActivityIndicatorBinding
-- (templateSlug, checklistKey) to look up bindings and capture indicator points
-- when an RP completes the item.

ALTER TABLE "ChecklistItem" ADD COLUMN "key" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "templateSlug" TEXT;

CREATE INDEX "ChecklistItem_templateSlug_key_idx" ON "ChecklistItem"("templateSlug", "key");
