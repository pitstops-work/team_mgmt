-- Seeding Fellowships launch portal — additive only (12 new tables + enum).
-- (DROP INDEX drift on ChecklistItem/Goal/PitstopEvent from `migrate diff` was
--  intentionally excluded; it is unrelated pre-existing live-DB drift.)

-- CreateEnum
CREATE TYPE "SeedingTaskStatus" AS ENUM ('not_started', 'in_progress', 'blocked', 'done');

-- CreateTable
CREATE TABLE "SeedingConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "week0Date" TIMESTAMP(3) NOT NULL,
    "launchWeek" INTEGER NOT NULL DEFAULT 14,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingGeo" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeedingGeo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingWorkstream" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SeedingWorkstream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingPhase" (
    "id" TEXT NOT NULL,
    "workstreamId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeedingPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingTask" (
    "id" TEXT NOT NULL,
    "workstreamId" TEXT NOT NULL,
    "phaseId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "ownerRole" TEXT,
    "supportRoles" TEXT,
    "startWeek" INTEGER,
    "dueWeek" INTEGER,
    "dependsOn" TEXT,
    "doneMetric" TEXT,
    "status" "SeedingTaskStatus" NOT NULL DEFAULT 'not_started',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingMilestone" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeedingMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingFunnelConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "fellowsPerGeo" INTEGER NOT NULL DEFAULT 25,
    "selectionRatio" INTEGER NOT NULL DEFAULT 100,
    "appBufferPct" DOUBLE PRECISION NOT NULL DEFAULT 0.20,
    "leadToApp" DOUBLE PRECISION NOT NULL DEFAULT 0.40,
    "coldReachToApp" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "reachToLead" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "shareFromWarm" DOUBLE PRECISION NOT NULL DEFAULT 0.70,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingFunnelConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingFunnelGeo" (
    "id" TEXT NOT NULL,
    "geoId" TEXT NOT NULL,
    "reachToDate" INTEGER NOT NULL DEFAULT 0,
    "leadsToDate" INTEGER NOT NULL DEFAULT 0,
    "appsReceived" INTEGER NOT NULL DEFAULT 0,
    "screened" INTEGER NOT NULL DEFAULT 0,
    "shortlisted" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedingFunnelGeo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "geoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeedingMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingRoleDef" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "newHire" TEXT,
    "reportsTo" TEXT,
    "count" TEXT,
    "coreResponsibility" TEXT,
    "ownsWorkstreams" TEXT,
    "inPlaceBy" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeedingRoleDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingExecPhase" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "phase" TEXT NOT NULL,
    "window" TEXT,
    "activities" TEXT,
    "milestones" TEXT,
    "quarters" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeedingExecPhase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedingPartnerInterface" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "colA" TEXT,
    "colB" TEXT,
    "colC" TEXT,
    "colD" TEXT,
    "colE" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SeedingPartnerInterface_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeedingGeo_key_key" ON "SeedingGeo"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SeedingWorkstream_key_key" ON "SeedingWorkstream"("key");

-- CreateIndex
CREATE INDEX "SeedingPhase_workstreamId_idx" ON "SeedingPhase"("workstreamId");

-- CreateIndex
CREATE INDEX "SeedingTask_workstreamId_idx" ON "SeedingTask"("workstreamId");

-- CreateIndex
CREATE INDEX "SeedingTask_phaseId_idx" ON "SeedingTask"("phaseId");

-- CreateIndex
CREATE INDEX "SeedingTask_status_idx" ON "SeedingTask"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SeedingFunnelGeo_geoId_key" ON "SeedingFunnelGeo"("geoId");

-- CreateIndex
CREATE INDEX "SeedingMember_userId_idx" ON "SeedingMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SeedingMember_userId_role_geoId_key" ON "SeedingMember"("userId", "role", "geoId");

-- AddForeignKey
ALTER TABLE "SeedingPhase" ADD CONSTRAINT "SeedingPhase_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "SeedingWorkstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingTask" ADD CONSTRAINT "SeedingTask_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "SeedingWorkstream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingTask" ADD CONSTRAINT "SeedingTask_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "SeedingPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingTask" ADD CONSTRAINT "SeedingTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingFunnelGeo" ADD CONSTRAINT "SeedingFunnelGeo_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingMember" ADD CONSTRAINT "SeedingMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedingMember" ADD CONSTRAINT "SeedingMember_geoId_fkey" FOREIGN KEY ("geoId") REFERENCES "SeedingGeo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
