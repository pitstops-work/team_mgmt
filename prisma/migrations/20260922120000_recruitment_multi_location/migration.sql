-- Recruitment: one JD, many cities.
--
-- A JD posted in several cities (same role, same rubric, different local
-- context) could not be modelled — RecruitmentJob.locationId was a single
-- required FK. This adds:
--
--   _RecruitmentJobLocations         — the full set of cities a JD runs in
--   RecruitmentScoutingDay.locationId — which city a given day was run FOR
--
-- RecruitmentJob.locationId stays as the PRIMARY location: it drives the JD
-- slug and is the default pick at generate time. Generation stays strictly
-- single-city — language, reference orgs, local red flags and mobility all
-- enter the prompt from ONE location, so merging cities would poison it.
--
-- Generated offline with `prisma migrate diff --from-schema <HEAD schema>
-- --to-schema prisma/schema.prisma`, so none of the historical index drift on
-- ChecklistItem/Goal/PitstopEvent leaks in. Additive-only: ADD COLUMN /
-- CREATE TABLE / CREATE INDEX / ADD CONSTRAINT, plus two idempotent backfill
-- INSERT/UPDATEs. No drops, no destructive rewrites.

-- AlterTable
ALTER TABLE "RecruitmentScoutingDay" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "_RecruitmentJobLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RecruitmentJobLocations_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RecruitmentJobLocations_B_index" ON "_RecruitmentJobLocations"("B");

-- CreateIndex
CREATE INDEX "RecruitmentScoutingDay_locationId_idx" ON "RecruitmentScoutingDay"("locationId");

-- AddForeignKey
ALTER TABLE "RecruitmentScoutingDay" ADD CONSTRAINT "RecruitmentScoutingDay_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "RecruitmentLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecruitmentJobLocations" ADD CONSTRAINT "_RecruitmentJobLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "RecruitmentJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RecruitmentJobLocations" ADD CONSTRAINT "_RecruitmentJobLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "RecruitmentLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill 1: every existing JD's primary location becomes its first membership
-- row, preserving the invariant that the primary is always in `locations`.
INSERT INTO "_RecruitmentJobLocations" ("A", "B")
SELECT "id", "locationId" FROM "RecruitmentJob"
ON CONFLICT DO NOTHING;

-- Backfill 2: existing scouting days were all generated single-city, so the
-- city they ran for is their JD's location. Blob-only legacy docs have no
-- jobId and keep locationId NULL — their city lives in jobSnapshotJson.
UPDATE "RecruitmentScoutingDay" d
SET "locationId" = j."locationId"
FROM "RecruitmentJob" j
WHERE d."jobId" = j."id" AND d."locationId" IS NULL;
