-- Action points: follow-ups that emerge during a visit/activity. Always rooted
-- in Goal → Pitstop → PitstopEvent. goalId + pitstopId are denormalized at
-- create-time so Home queries (today / overdue / cluster-scoped) are one-hop.
-- See model docstring in schema.prisma for v1 design notes.

CREATE TABLE "ActionPoint" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "pitstopId" TEXT NOT NULL,
    "pitstopEventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "partnerStaffLabel" TEXT,
    "ownerId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'routine',
    "status" TEXT NOT NULL DEFAULT 'open',
    "closureNote" TEXT,
    "closureProofUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUpdatedById" TEXT,

    CONSTRAINT "ActionPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActionPoint_ownerId_status_dueDate_idx" ON "ActionPoint"("ownerId", "status", "dueDate");
CREATE INDEX "ActionPoint_pitstopEventId_idx" ON "ActionPoint"("pitstopEventId");
CREATE INDEX "ActionPoint_pitstopId_idx" ON "ActionPoint"("pitstopId");
CREATE INDEX "ActionPoint_goalId_idx" ON "ActionPoint"("goalId");
CREATE INDEX "ActionPoint_status_dueDate_idx" ON "ActionPoint"("status", "dueDate");

ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_goalId_fkey"
    FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_pitstopId_fkey"
    FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_pitstopEventId_fkey"
    FOREIGN KEY ("pitstopEventId") REFERENCES "PitstopEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_lastUpdatedById_fkey"
    FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_completedById_fkey"
    FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
