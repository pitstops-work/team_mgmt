-- Goal start date (already collected by CreateGoalModal, was previously dropped)
-- and explicit closedAt for SLA computation (avoid relying on updatedAt which
-- moves on any edit).

ALTER TABLE "Goal" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "Goal" ADD COLUMN "closedAt"  TIMESTAMP(3);

-- Backfill: legacy goals get createdAt as their start date.
UPDATE "Goal" SET "startDate" = "createdAt" WHERE "startDate" IS NULL;

-- Backfill: already-Complete goals use updatedAt as a best-effort closedAt.
UPDATE "Goal" SET "closedAt" = "updatedAt"
WHERE "status" = 'Complete' AND "closedAt" IS NULL;

CREATE INDEX "Goal_closedAt_idx" ON "Goal"("closedAt");
