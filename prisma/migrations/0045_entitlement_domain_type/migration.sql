-- AlterTable: add linkedSchemeId to NeedsFormulaConfig
ALTER TABLE "NeedsFormulaConfig" ADD COLUMN "linkedSchemeId" TEXT;

-- AddForeignKey
ALTER TABLE "NeedsFormulaConfig" ADD CONSTRAINT "NeedsFormulaConfig_linkedSchemeId_fkey" FOREIGN KEY ("linkedSchemeId") REFERENCES "EntitlementScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;
