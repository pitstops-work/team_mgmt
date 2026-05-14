-- AlterTable
ALTER TABLE "NeedsFormulaConfig" ADD COLUMN "staleYellowDays" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "NeedsFormulaConfig" ADD COLUMN "staleRedDays" INTEGER NOT NULL DEFAULT 120;
