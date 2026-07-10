-- Curated Road-to-Launch milestones — additive (1 new table + 1 nullable column).

-- CreateTable
CREATE TABLE "SeedingLaunchMilestone" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "targetWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingLaunchMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeedingLaunchMilestone_key_key" ON "SeedingLaunchMilestone"("key");

-- AlterTable
ALTER TABLE "SeedingPhase" ADD COLUMN "milestoneId" TEXT;

-- CreateIndex
CREATE INDEX "SeedingPhase_milestoneId_idx" ON "SeedingPhase"("milestoneId");

-- AddForeignKey
ALTER TABLE "SeedingPhase" ADD CONSTRAINT "SeedingPhase_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "SeedingLaunchMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
