-- Seeding outreach layer: the engine under the funnel.
--
--   SeedingSubGeo  — the level below a geography (NE states, Bangalore clusters)
--   SeedingChannel — ONE directory of everything we reach people through
--   SeedingSession — one dated act of outreach; held sessions carry the counts
--   SeedingLead    — named register for warm leads only (personal data)
--
-- Plus outreach assumptions on SeedingFunnelConfig and materialised rollup
-- columns on SeedingFunnelGeo.
--
-- Generated offline with `prisma migrate diff --from-schema <HEAD schema>
-- --to-schema prisma/schema.prisma`, so none of the historical DROP INDEX drift
-- on ChecklistItem/Goal/PitstopEvent leaks in. Verified additive-only: CREATE
-- TYPE / CREATE TABLE / ADD COLUMN / CREATE INDEX / ADD CONSTRAINT, no drops.


-- CreateEnum
CREATE TYPE "SeedingChannelKind" AS ENUM ('institution', 'alumni_network', 'partner_org', 'forum_community', 'govt_body', 'digital_channel');

-- CreateEnum
CREATE TYPE "SeedingChannelStage" AS ENUM ('identified', 'contacted', 'responded', 'agreed', 'active', 'dropped');

-- CreateEnum
CREATE TYPE "SeedingSessionKind" AS ENUM ('campus_session', 'webinar', 'info_desk', 'meeting', 'digital_blast', 'other');

-- CreateEnum
CREATE TYPE "SeedingSessionStatus" AS ENUM ('planned', 'held', 'cancelled');

-- CreateEnum
CREATE TYPE "SeedingLeadStage" AS ENUM ('captured', 'nurtured', 'applied', 'dropped');

-- AlterTable
ALTER TABLE "SeedingFunnelConfig" ADD COLUMN     "avgReachPerSession" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "channelAgreeRate" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
ADD COLUMN     "sessionsPerChannel" DOUBLE PRECISION NOT NULL DEFAULT 1.5;

-- AlterTable
ALTER TABLE "SeedingFunnelGeo" ADD COLUMN     "channelsActive" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "channelsTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "leadsOpening" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openingNote" TEXT,
ADD COLUMN     "reachOpening" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rollupAt" TIMESTAMP(3),
ADD COLUMN     "sessionsHeld" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sessionsPlanned" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "SeedingSubGeo" (
    "id" TEXT NOT NULL,
    "geoId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingSubGeo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingChannel" (
    "id" TEXT NOT NULL,
    "geoId" TEXT,
    "subGeoId" TEXT,
    "kind" "SeedingChannelKind" NOT NULL,
    "stage" "SeedingChannelStage" NOT NULL DEFAULT 'identified',
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "contactName" TEXT,
    "contactRole" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "externalCode" TEXT,
    "district" TEXT,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "websiteUrl" TEXT,
    "estimatedReach" INTEGER,
    "orgId" TEXT,
    "ownerUserId" TEXT,
    "source" TEXT,
    "notes" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "firstContactedAt" TIMESTAMP(3),
    "agreedAt" TIMESTAMP(3),
    "sessionsHeld" INTEGER NOT NULL DEFAULT 0,
    "reachToDate" INTEGER NOT NULL DEFAULT 0,
    "leadsToDate" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3),
    "origin" TEXT DEFAULT 'manual',
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingSession" (
    "id" TEXT NOT NULL,
    "geoId" TEXT,
    "subGeoId" TEXT,
    "channelId" TEXT,
    "kind" "SeedingSessionKind" NOT NULL,
    "status" "SeedingSessionStatus" NOT NULL DEFAULT 'planned',
    "title" TEXT NOT NULL,
    "originalScheduledAt" TIMESTAMP(3) NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "heldAt" TIMESTAMP(3),
    "location" TEXT,
    "expectedReach" INTEGER,
    "reachCount" INTEGER NOT NULL DEFAULT 0,
    "leadsCaptured" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "proofUrl" TEXT,
    "cancelledReason" TEXT,
    "ownerUserId" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingLead" (
    "id" TEXT NOT NULL,
    "geoId" TEXT,
    "subGeoId" TEXT,
    "channelId" TEXT,
    "sessionId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "ageBand" TEXT,
    "occupation" TEXT,
    "theme" TEXT,
    "interestNote" TEXT,
    "stage" "SeedingLeadStage" NOT NULL DEFAULT 'captured',
    "consentAt" TIMESTAMP(3),
    "lastContactedAt" TIMESTAMP(3),
    "nextActionAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeedingSubGeo_geoId_idx" ON "SeedingSubGeo"("geoId");

-- CreateIndex
CREATE UNIQUE INDEX "SeedingSubGeo_geoId_key_key" ON "SeedingSubGeo"("geoId", "key");

-- CreateIndex
CREATE INDEX "SeedingChannel_geoId_kind_idx" ON "SeedingChannel"("geoId", "kind");

-- CreateIndex
CREATE INDEX "SeedingChannel_geoId_stage_idx" ON "SeedingChannel"("geoId", "stage");

-- CreateIndex
CREATE INDEX "SeedingChannel_subGeoId_idx" ON "SeedingChannel"("subGeoId");

-- CreateIndex
CREATE INDEX "SeedingChannel_orgId_idx" ON "SeedingChannel"("orgId");

-- CreateIndex
CREATE INDEX "SeedingChannel_archivedAt_idx" ON "SeedingChannel"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SeedingChannel_geoId_nameKey_key" ON "SeedingChannel"("geoId", "nameKey");

-- CreateIndex
CREATE INDEX "SeedingSession_geoId_status_idx" ON "SeedingSession"("geoId", "status");

-- CreateIndex
CREATE INDEX "SeedingSession_geoId_heldAt_idx" ON "SeedingSession"("geoId", "heldAt");

-- CreateIndex
CREATE INDEX "SeedingSession_channelId_idx" ON "SeedingSession"("channelId");

-- CreateIndex
CREATE INDEX "SeedingSession_subGeoId_idx" ON "SeedingSession"("subGeoId");

-- CreateIndex
CREATE INDEX "SeedingSession_archivedAt_idx" ON "SeedingSession"("archivedAt");

-- CreateIndex
CREATE INDEX "SeedingLead_geoId_stage_idx" ON "SeedingLead"("geoId", "stage");

-- CreateIndex
CREATE INDEX "SeedingLead_sessionId_idx" ON "SeedingLead"("sessionId");

-- CreateIndex
CREATE INDEX "SeedingLead_channelId_idx" ON "SeedingLead"("channelId");

-- CreateIndex
CREATE INDEX "SeedingLead_archivedAt_idx" ON "SeedingLead"("archivedAt");

-- AddForeignKey
ALTER TABLE "SeedingSubGeo" ADD CONSTRAINT "SeedingSubGeo_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingChannel" ADD CONSTRAINT "SeedingChannel_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingChannel" ADD CONSTRAINT "SeedingChannel_subGeoId_fkey" FOREIGN KEY ("subGeoId") REFERENCES "SeedingSubGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingChannel" ADD CONSTRAINT "SeedingChannel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingChannel" ADD CONSTRAINT "SeedingChannel_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingChannel" ADD CONSTRAINT "SeedingChannel_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingSession" ADD CONSTRAINT "SeedingSession_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingSession" ADD CONSTRAINT "SeedingSession_subGeoId_fkey" FOREIGN KEY ("subGeoId") REFERENCES "SeedingSubGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingSession" ADD CONSTRAINT "SeedingSession_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SeedingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingSession" ADD CONSTRAINT "SeedingSession_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingSession" ADD CONSTRAINT "SeedingSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingLead" ADD CONSTRAINT "SeedingLead_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingLead" ADD CONSTRAINT "SeedingLead_subGeoId_fkey" FOREIGN KEY ("subGeoId") REFERENCES "SeedingSubGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingLead" ADD CONSTRAINT "SeedingLead_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SeedingChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingLead" ADD CONSTRAINT "SeedingLead_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "SeedingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingLead" ADD CONSTRAINT "SeedingLead_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingLead" ADD CONSTRAINT "SeedingLead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Carry the hand-typed funnel actuals forward as opening balances. From here
-- reachToDate/leadsToDate are DERIVED (= opening + Σ held sessions), so this
-- keeps every existing number exactly where it is until the first session is
-- logged. Must ship in the same migration as the columns above.
UPDATE "SeedingFunnelGeo"
   SET "reachOpening" = "reachToDate",
       "leadsOpening" = "leadsToDate",
       "openingNote"  = 'Carried forward from the hand-typed tracker, 2026-09-15'
 WHERE "reachToDate" > 0 OR "leadsToDate" > 0;
