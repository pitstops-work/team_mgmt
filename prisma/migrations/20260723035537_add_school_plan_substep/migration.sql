-- CreateTable
CREATE TABLE "SchoolPlanSubstep" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "SchoolStepStatus" NOT NULL DEFAULT 'pending',
    "ownerUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "blockingNote" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolPlanSubstep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SchoolPlanSubstep_stepId_position_idx" ON "SchoolPlanSubstep"("stepId", "position");

-- CreateIndex
CREATE INDEX "SchoolPlanSubstep_ownerUserId_idx" ON "SchoolPlanSubstep"("ownerUserId");

-- AddForeignKey
ALTER TABLE "SchoolPlanSubstep" ADD CONSTRAINT "SchoolPlanSubstep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SchoolPlanStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolPlanSubstep" ADD CONSTRAINT "SchoolPlanSubstep_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

