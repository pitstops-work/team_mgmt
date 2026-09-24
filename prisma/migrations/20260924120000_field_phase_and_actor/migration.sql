-- /field W0 foundations: the phase (workstream) label and a last-actor stamp.
-- Purely additive — four nullable columns and two SET NULL foreign keys.
--
-- phaseTag restores the named phase the rebuild dropped: the old spine derived
-- "Infrastructure · 3/9" from Pitstop.progressTag, which FieldStep had no
-- equivalent for. Carried across from TemplatePitstopDef.progressTag at derive
-- time, then onto FieldStep at materialise / resync / backfill time.
--
-- lastUpdatedById is the logbook's companion: unlike completedById it survives a
-- reopen/untick, so undoing a completion no longer erases who had done it.
--
-- (Pre-existing live-DB drift on ChecklistItem/Goal/PitstopEvent indexes and on
-- BbmpSchool/IndiraCanteen/SchoolPlan columns is intentionally NOT included here
-- — it is unrelated to this feature. Same exclusion as 20260812090000.)

-- AlterTable
ALTER TABLE "SetupStepTemplate" ADD COLUMN "phaseTag" TEXT;

-- AlterTable
ALTER TABLE "FieldStep" ADD COLUMN "phaseTag" TEXT,
ADD COLUMN "lastUpdatedById" TEXT;

-- AlterTable
ALTER TABLE "FieldVisitStep" ADD COLUMN "lastUpdatedById" TEXT;

-- AddForeignKey
ALTER TABLE "FieldStep" ADD CONSTRAINT "FieldStep_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldVisitStep" ADD CONSTRAINT "FieldVisitStep_lastUpdatedById_fkey" FOREIGN KEY ("lastUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
