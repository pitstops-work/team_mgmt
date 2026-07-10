-- Seeding sub-tasks — additive (1 new table). Unrelated pre-existing DROP INDEX
-- drift from `migrate diff` intentionally excluded.

-- CreateTable
CREATE TABLE "SeedingSubtask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "ownerRole" TEXT,
    "supportRoles" TEXT,
    "startWeek" INTEGER,
    "dueWeek" INTEGER,
    "dependsOn" TEXT,
    "doneMetric" TEXT,
    "status" "SeedingTaskStatus" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeedingSubtask_taskId_idx" ON "SeedingSubtask"("taskId");

-- AddForeignKey
ALTER TABLE "SeedingSubtask" ADD CONSTRAINT "SeedingSubtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SeedingTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
