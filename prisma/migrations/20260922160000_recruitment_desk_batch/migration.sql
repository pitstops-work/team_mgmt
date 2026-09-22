-- Recruitment: group the desks produced by one multi-city run.
--
-- One posting for a multi-location JD draws CVs for every city at once.
-- Triage splits them per city and each city gets its own desk, because
-- generation is single-city (the prompt carries one city's language,
-- reference orgs and red flags). batchId is what ties those desks back
-- together for the batch view and the sibling links on each desk.
--
-- Opaque id rather than a foreign key on purpose: a batch has no lifecycle
-- or attributes of its own beyond the rows carrying it.
--
-- Additive-only: one nullable column + one index. Existing desks keep
-- batchId NULL, which reads correctly as "not part of a batch".

-- AlterTable
ALTER TABLE "RecruitmentScoutingDay" ADD COLUMN     "batchId" TEXT;

-- CreateIndex
CREATE INDEX "RecruitmentScoutingDay_batchId_idx" ON "RecruitmentScoutingDay"("batchId");
