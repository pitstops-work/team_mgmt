-- AlterTable
ALTER TABLE "SchoolPlan" ADD COLUMN     "launchDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SchoolPlanStep" ADD COLUMN     "dueWeek" INTEGER,
ADD COLUMN     "ownerRole" TEXT;

-- AlterTable
ALTER TABLE "SchoolPlanSubstep" ADD COLUMN     "dueWeek" INTEGER,
ADD COLUMN     "ownerRole" TEXT;

