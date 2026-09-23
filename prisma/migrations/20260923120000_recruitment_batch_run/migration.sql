-- Recruitment: move a multi-city scouting run's state out of the browser.
--
-- A run builds one desk per city, each desk in chunks of CVs, because one
-- Claude call for a large pool cannot finish inside the 300s function
-- ceiling. That is a ~25-minute sequence of model calls, and it used to be
-- driven by a for-loop in the recruiter's tab with progress in a React ref.
-- On the 89-CV run of 2026-09-22 a single dropped connection ended it at
-- 48 of 89 CVs — no server error, nothing in the logs, and no way to resume
-- once the tab was closed.
--
-- The plan now lives here: the browser posts it once and may close, the
-- runner drains it chunk by chunk and records progress only after a chunk is
-- COMMITTED, and a cron re-kicks any run whose lease has gone stale.
--
-- Additive-only: one new table. Existing desks and their batchId values are
-- untouched — desks made before this migration simply have no run row.

-- CreateTable
CREATE TABLE "RecruitmentBatchRun" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "title" TEXT NOT NULL,
    "matchday" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "planJson" JSONB NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "RecruitmentBatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruitmentBatchRun_status_lockedAt_idx" ON "RecruitmentBatchRun"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "RecruitmentBatchRun_jobId_idx" ON "RecruitmentBatchRun"("jobId");

-- AddForeignKey
ALTER TABLE "RecruitmentBatchRun" ADD CONSTRAINT "RecruitmentBatchRun_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "RecruitmentJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruitmentBatchRun" ADD CONSTRAINT "RecruitmentBatchRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
