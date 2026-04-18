-- Migration 0039: GoalOutcome — settlement-level attribution when completing domain goals.
--
-- When a domain goal (needsDomain set) is marked Complete, one or more GoalOutcome
-- rows record exactly which settlement(s) received the outcome and how many units.
-- This makes "actuals" at the settlement level precise rather than inherited from
-- the cluster/zone the goal was scoped to.

CREATE TABLE "GoalOutcome" (
  "id"           TEXT         NOT NULL,
  "goalId"       TEXT         NOT NULL,
  "settlementId" TEXT         NOT NULL,
  "count"        INTEGER      NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GoalOutcome_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "GoalOutcome_goalId_fkey"   FOREIGN KEY ("goalId")       REFERENCES "Goal"("id")       ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GoalOutcome_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "GoalOutcome_goalId_idx"       ON "GoalOutcome"("goalId");
CREATE INDEX "GoalOutcome_settlementId_idx" ON "GoalOutcome"("settlementId");
