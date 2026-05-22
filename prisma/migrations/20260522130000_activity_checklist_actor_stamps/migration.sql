-- Actor stamping for activity (PitstopEvent) and checklist (ChecklistItem)
-- so the per-user activity feed can attribute "who completed / last touched".

ALTER TABLE "PitstopEvent" ADD COLUMN "lastUpdatedById" TEXT;
ALTER TABLE "PitstopEvent" ADD COLUMN "completedById"   TEXT;

ALTER TABLE "ChecklistItem" ADD COLUMN "lastUpdatedById" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "completedById"   TEXT;

ALTER TABLE "PitstopEvent" ADD CONSTRAINT "PitstopEvent_lastUpdatedById_fkey"
  FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PitstopEvent" ADD CONSTRAINT "PitstopEvent_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_lastUpdatedById_fkey"
  FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PitstopEvent_lastUpdatedById_idx"  ON "PitstopEvent"("lastUpdatedById");
CREATE INDEX "PitstopEvent_completedById_idx"   ON "PitstopEvent"("completedById");
CREATE INDEX "ChecklistItem_lastUpdatedById_idx" ON "ChecklistItem"("lastUpdatedById");
CREATE INDEX "ChecklistItem_completedById_idx"  ON "ChecklistItem"("completedById");
