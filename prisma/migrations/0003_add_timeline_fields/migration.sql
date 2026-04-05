-- AlterTable Goal
ALTER TABLE "Goal" ADD COLUMN "targetDate" TIMESTAMP(3);

-- AlterTable Pitstop
ALTER TABLE "Pitstop" ADD COLUMN "startDate"   TIMESTAMP(3);
ALTER TABLE "Pitstop" ADD COLUMN "targetDate"  TIMESTAMP(3);
ALTER TABLE "Pitstop" ADD COLUMN "completedAt" TIMESTAMP(3);
