-- A decision can say that its baseline was reconstructed after the fact.
--
-- A grant approved before this system existed has to be written up
-- retrospectively, and the snapshot then freezes TODAY's budget lines rather
-- than the ones the committee saw. Diffing against those would report
-- "nothing has changed since approval" — the most misleading answer
-- available, because it reads as reassurance. The flag makes the baseline
-- explicitly unusable for variance instead of quietly wrong.
--
-- Additive: two columns, one with a safe default, no backfill.

-- AlterTable
ALTER TABLE "GrantDecision" ADD COLUMN     "baselineIsReconstructed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reconstructionNote" TEXT;

