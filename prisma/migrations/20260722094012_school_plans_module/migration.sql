-- After-School Centres portal (SchoolPlan + 11 child models + 5 enums).
-- User inverse relations are Prisma-only (no columns), so this migration only
-- adds the new enums, tables, indexes and foreign keys.

-- ============================================================================
-- Enums
-- ============================================================================

CREATE TYPE "SchoolPlanStatus" AS ENUM ('draft', 'for_review', 'approved');
CREATE TYPE "SchoolStepStatus" AS ENUM ('pending', 'in_progress', 'done', 'blocked', 'not_applicable');
CREATE TYPE "SchoolStaffPayroll" AS ENUM ('us', 'anchor', 'specialist', 'agency');
CREATE TYPE "SchoolServiceStatus" AS ENUM ('ok', 'gap', 'unknown');
CREATE TYPE "SchoolComponentDelivery" AS ENUM ('us', 'anchor', 'specialist', 'agency');

-- ============================================================================
-- SchoolPlan (parent)
-- ============================================================================

CREATE TABLE "SchoolPlan" (
  "id"                   TEXT NOT NULL,
  "name"                 TEXT NOT NULL,
  "officialName"         TEXT,
  "diseCode"             TEXT,
  "schoolType"           TEXT,
  "addressText"          TEXT,
  "geoLat"               DOUBLE PRECISION,
  "geoLng"               DOUBLE PRECISION,
  "taluk"                TEXT,
  "district"             TEXT,
  "ward"                 TEXT,
  "yearEstablished"      INTEGER,
  "grades"               TEXT,
  "sections"             TEXT,
  "mediums"              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enrolmentBoys"        INTEGER,
  "enrolmentGirls"       INTEGER,
  "teachersSanctioned"   INTEGER,
  "teachersWorking"      INTEGER,
  "classroomsCount"      INTEGER,
  "otherRoomsCount"      INTEGER,
  "timings"              TEXT,
  "shifts"               TEXT,
  "vacationMonths"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "headTeacherName"      TEXT,
  "headTeacherPhone"     TEXT,
  "sdmcStatus"           TEXT,
  "deptContactName"      TEXT,
  "ourLeadUserId"        TEXT,
  "anchorPartnerName"    TEXT,
  "campusAfterHoursUse"  TEXT,
  "siteAreaSqft"         INTEGER,
  "builtupAreaSqft"      INTEGER,
  "surveyStatus"         TEXT,
  "targetChildrenPerDay" INTEGER,
  "capacityRead"         TEXT,
  "mobilisationNotes"    TEXT,
  "planStatus"           "SchoolPlanStatus" NOT NULL DEFAULT 'draft',
  "planVersion"          INTEGER NOT NULL DEFAULT 1,
  "budgetId"             TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolPlan_budgetId_key" ON "SchoolPlan"("budgetId");
CREATE INDEX "SchoolPlan_district_idx"          ON "SchoolPlan"("district");
CREATE INDEX "SchoolPlan_planStatus_idx"        ON "SchoolPlan"("planStatus");
ALTER TABLE "SchoolPlan"
  ADD CONSTRAINT "SchoolPlan_ourLeadUserId_fkey"
  FOREIGN KEY ("ourLeadUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolPlan"
  ADD CONSTRAINT "SchoolPlan_budgetId_fkey"
  FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanStep
-- ============================================================================

CREATE TABLE "SchoolPlanStep" (
  "id"                   TEXT NOT NULL,
  "planId"               TEXT NOT NULL,
  "stepNo"               INTEGER NOT NULL,
  "key"                  TEXT NOT NULL,
  "title"                TEXT NOT NULL,
  "description"          TEXT,
  "planSection"          TEXT,
  "requiredArtifactType" TEXT,
  "ownerUserId"          TEXT,
  "dueDate"              TIMESTAMP(3),
  "status"               "SchoolStepStatus" NOT NULL DEFAULT 'pending',
  "blockingNote"         TEXT,
  "completedAt"          TIMESTAMP(3),
  "completedById"        TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SchoolPlanStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolPlanStep_planId_stepNo_key" ON "SchoolPlanStep"("planId","stepNo");
CREATE INDEX "SchoolPlanStep_status_dueDate_idx"       ON "SchoolPlanStep"("status","dueDate");
ALTER TABLE "SchoolPlanStep"
  ADD CONSTRAINT "SchoolPlanStep_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPlanStep"
  ADD CONSTRAINT "SchoolPlanStep_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanCatchment
-- ============================================================================

CREATE TABLE "SchoolPlanCatchment" (
  "id"               TEXT NOT NULL,
  "planId"           TEXT NOT NULL,
  "settlementId"     TEXT,
  "name"             TEXT NOT NULL,
  "geoLat"           DOUBLE PRECISION,
  "geoLng"           DOUBLE PRECISION,
  "distanceMeters"   INTEGER,
  "walkMinutes"      INTEGER,
  "children0to3"     INTEGER,
  "children3to14"    INTEGER,
  "children14to18"   INTEGER,
  "existingServices" TEXT,
  "sortOrder"        INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPlanCatchment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SchoolPlanCatchment"
  ADD CONSTRAINT "SchoolPlanCatchment_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanSpace
-- ============================================================================

CREATE TABLE "SchoolPlanSpace" (
  "id"                 TEXT NOT NULL,
  "planId"             TEXT NOT NULL,
  "building"           TEXT,
  "floor"              TEXT,
  "name"               TEXT NOT NULL,
  "sizeSqm"            DOUBLE PRECISION,
  "currentUse"         TEXT,
  "proposedUse"        TEXT,
  "capacityPerSession" INTEGER,
  "sessionsPerDay"     INTEGER DEFAULT 1,
  "changesNeeded"      TEXT,
  "structuralFlags"    TEXT,
  "sortOrder"          INTEGER NOT NULL DEFAULT 0,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPlanSpace_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SchoolPlanSpace"
  ADD CONSTRAINT "SchoolPlanSpace_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanService
-- ============================================================================

CREATE TABLE "SchoolPlanService" (
  "id"      TEXT NOT NULL,
  "planId"  TEXT NOT NULL,
  "item"    TEXT NOT NULL,
  "status"  "SchoolServiceStatus" NOT NULL DEFAULT 'unknown',
  "details" TEXT,
  CONSTRAINT "SchoolPlanService_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolPlanService_planId_item_key" ON "SchoolPlanService"("planId","item");
ALTER TABLE "SchoolPlanService"
  ADD CONSTRAINT "SchoolPlanService_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanComponent
-- ============================================================================

CREATE TABLE "SchoolPlanComponent" (
  "id"                  TEXT NOT NULL,
  "planId"              TEXT NOT NULL,
  "component"           TEXT NOT NULL,
  "offerText"           TEXT,
  "deliveredBy"         "SchoolComponentDelivery" NOT NULL,
  "schedule"            TEXT,
  "childrenPerDay"      INTEGER,
  "specialistPartnerId" TEXT,
  "planVetted"          BOOLEAN NOT NULL DEFAULT false,
  "sortOrder"           INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SchoolPlanComponent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolPlanComponent_planId_component_key" ON "SchoolPlanComponent"("planId","component");
ALTER TABLE "SchoolPlanComponent"
  ADD CONSTRAINT "SchoolPlanComponent_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanStaffing
-- ============================================================================

CREATE TABLE "SchoolPlanStaffing" (
  "id"        TEXT NOT NULL,
  "planId"    TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "count"     INTEGER NOT NULL,
  "payroll"   "SchoolStaffPayroll" NOT NULL,
  "status"    TEXT NOT NULL DEFAULT 'identified',
  "notes"     TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SchoolPlanStaffing_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SchoolPlanStaffing"
  ADD CONSTRAINT "SchoolPlanStaffing_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanMilestone
-- ============================================================================

CREATE TABLE "SchoolPlanMilestone" (
  "id"         TEXT NOT NULL,
  "planId"     TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "targetDate" TIMESTAMP(3),
  "dependsOn"  TEXT,
  "status"     TEXT NOT NULL DEFAULT 'pending',
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "SchoolPlanMilestone_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SchoolPlanMilestone"
  ADD CONSTRAINT "SchoolPlanMilestone_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanRisk
-- ============================================================================

CREATE TABLE "SchoolPlanRisk" (
  "id"          TEXT NOT NULL,
  "planId"      TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "mitigation"  TEXT,
  "ownerUserId" TEXT,
  "status"      TEXT NOT NULL DEFAULT 'open',
  "sortOrder"   INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPlanRisk_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SchoolPlanRisk"
  ADD CONSTRAINT "SchoolPlanRisk_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPlanRisk"
  ADD CONSTRAINT "SchoolPlanRisk_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanArtifact
-- ============================================================================

CREATE TABLE "SchoolPlanArtifact" (
  "id"           TEXT NOT NULL,
  "planId"       TEXT NOT NULL,
  "stepId"       TEXT,
  "kind"         TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "url"          TEXT NOT NULL,
  "size"         INTEGER,
  "mimeType"     TEXT,
  "caption"      TEXT,
  "uploadedById" TEXT,
  "version"      INTEGER NOT NULL DEFAULT 1,
  "planSection"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPlanArtifact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SchoolPlanArtifact_planId_kind_idx" ON "SchoolPlanArtifact"("planId","kind");
ALTER TABLE "SchoolPlanArtifact"
  ADD CONSTRAINT "SchoolPlanArtifact_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPlanArtifact"
  ADD CONSTRAINT "SchoolPlanArtifact_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "SchoolPlanStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SchoolPlanArtifact"
  ADD CONSTRAINT "SchoolPlanArtifact_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanSignoff
-- ============================================================================

CREATE TABLE "SchoolPlanSignoff" (
  "id"            TEXT NOT NULL,
  "planId"        TEXT NOT NULL,
  "preparedById"  TEXT,
  "preparedAt"    TIMESTAMP(3),
  "reviewedById"  TEXT,
  "reviewedAt"    TIMESTAMP(3),
  "reviewerNotes" TEXT,
  "approvedById"  TEXT,
  "approvedAt"    TIMESTAMP(3),
  "approvalNotes" TEXT,
  CONSTRAINT "SchoolPlanSignoff_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolPlanSignoff_planId_key" ON "SchoolPlanSignoff"("planId");
ALTER TABLE "SchoolPlanSignoff"
  ADD CONSTRAINT "SchoolPlanSignoff_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- SchoolPlanMember
-- ============================================================================

CREATE TABLE "SchoolPlanMember" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "role"      TEXT NOT NULL,
  "planId"    TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SchoolPlanMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SchoolPlanMember_userId_role_planId_key" ON "SchoolPlanMember"("userId","role","planId");
CREATE INDEX "SchoolPlanMember_userId_idx"                    ON "SchoolPlanMember"("userId");
ALTER TABLE "SchoolPlanMember"
  ADD CONSTRAINT "SchoolPlanMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchoolPlanMember"
  ADD CONSTRAINT "SchoolPlanMember_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "SchoolPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
