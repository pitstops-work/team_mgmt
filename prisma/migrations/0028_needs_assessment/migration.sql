-- ── Needs Assessment System ───────────────────────────────────────────────────

-- CreateEnum: NeedsDomain
CREATE TYPE "NeedsDomain" AS ENUM (
  'Creche',
  'ChildrenCentre',
  'YouthGroup',
  'ElderlyKitchen',
  'PalliativeSupport',
  'CommunityToilet',
  'WaterATM',
  'Entitlement'
);

-- Add needs fields to Goal
ALTER TABLE "Goal"
  ADD COLUMN "needsDomain"      "NeedsDomain",
  ADD COLUMN "parameter"        DOUBLE PRECISION,
  ADD COLUMN "needsSettlementId" TEXT,
  ADD COLUMN "needsClusterId"   TEXT,
  ADD COLUMN "needsZoneId"      TEXT;

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_needsSettlementId_fkey"
    FOREIGN KEY ("needsSettlementId") REFERENCES "Settlement"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Goal_needsClusterId_fkey"
    FOREIGN KEY ("needsClusterId") REFERENCES "Cluster"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Goal_needsZoneId_fkey"
    FOREIGN KEY ("needsZoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: NeedsFormulaConfig (one row per domain, admin-editable denominators)
CREATE TABLE "NeedsFormulaConfig" (
  "domain"      "NeedsDomain" NOT NULL,
  "denominator" INTEGER       NOT NULL DEFAULT 1,
  "description" TEXT,
  "updatedAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NeedsFormulaConfig_pkey" PRIMARY KEY ("domain")
);

INSERT INTO "NeedsFormulaConfig" ("domain", "denominator", "description") VALUES
  ('Creche',            20,  'children 6m–3yr per creche'),
  ('ChildrenCentre',   500,  'children 4–14 per centre'),
  ('YouthGroup',        30,  'youth 15–21 per group'),
  ('ElderlyKitchen',    50,  'elderly 60+ per community kitchen'),
  ('PalliativeSupport',100,  'elderly 60+ per palliative support unit'),
  ('CommunityToilet',  200,  'households per community toilet block'),
  ('WaterATM',         250,  'households per water ATM');

-- CreateTable: EntitlementScheme (hierarchical — BoCW parent + 14 children)
CREATE TABLE "EntitlementScheme" (
  "id"          TEXT          NOT NULL,
  "name"        TEXT          NOT NULL,
  "description" TEXT,
  "parentId"    TEXT,
  "sortOrder"   INTEGER       NOT NULL DEFAULT 0,
  "isActive"    BOOLEAN       NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntitlementScheme_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EntitlementScheme_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "EntitlementScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: SettlementAssessment (versioned — one row per survey per settlement)
CREATE TABLE "SettlementAssessment" (
  "id"              TEXT         NOT NULL,
  "settlementId"    TEXT         NOT NULL,
  "assessmentYear"  INTEGER      NOT NULL,
  "assessedById"    TEXT         NOT NULL,
  "assessedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Population (drives target calculations)
  "totalHouseholds"   INTEGER NOT NULL DEFAULT 0,
  "children6m3yr"     INTEGER NOT NULL DEFAULT 0,
  "children4to14"     INTEGER NOT NULL DEFAULT 0,
  "youth15to21"       INTEGER NOT NULL DEFAULT 0,
  "elderly60plus"     INTEGER NOT NULL DEFAULT 0,

  -- Existing infrastructure counts (gap = target - existing - apf_actuals)
  "existingCreches"           INTEGER NOT NULL DEFAULT 0,
  "existingChildrenCentres"   INTEGER NOT NULL DEFAULT 0,
  "existingYouthGroups"       INTEGER NOT NULL DEFAULT 0,
  "existingElderlyKitchens"   INTEGER NOT NULL DEFAULT 0,
  "existingPalliativeUnits"   INTEGER NOT NULL DEFAULT 0,
  "existingCommunityToilets"  INTEGER NOT NULL DEFAULT 0,
  "existingWaterATMs"         INTEGER NOT NULL DEFAULT 0,

  -- Settlement profile (Section 2)
  "settlementType"    TEXT,
  "composition"       TEXT,
  "predominantGroups" TEXT,
  "languages"         TEXT,
  "yearsEstablished"  INTEGER,

  -- Land & Tenure (Section 3)
  "landOwnership"       TEXT,
  "legalStatus"         TEXT,
  "hakkupatraEligible"  INTEGER,

  -- Priority issues & notes (Sections 11–12)
  "priorityIssues"    TEXT,
  "enumeratorNotes"   TEXT,

  CONSTRAINT "SettlementAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SettlementAssessment_settlementId_fkey"
    FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "SettlementAssessment_assessedById_fkey"
    FOREIGN KEY ("assessedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "SettlementAssessment_settlementId_assessedAt_idx"
  ON "SettlementAssessment"("settlementId", "assessedAt");

-- CreateTable: RoadBaseline (Section 4)
CREATE TABLE "RoadBaseline" (
  "assessmentId"  TEXT NOT NULL,
  "roadType"      TEXT,   -- CONCRETE|GRAVEL|MUD|NONE
  "condition"     TEXT,   -- GOOD|DAMAGED|VERY_POOR
  "accessibility" TEXT,   -- MOTORABLE|TWO_WHEELER|PEDESTRIAN
  "unusableInRain" BOOLEAN NOT NULL DEFAULT false,
  "remarks"       TEXT,
  CONSTRAINT "RoadBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "RoadBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: WaterBaseline (Section 5)
CREATE TABLE "WaterBaseline" (
  "assessmentId"          TEXT    NOT NULL,
  "drinkingSource"        TEXT,   -- PIPED|PUBLIC_TAP|BOREWELL|TANKER|PACKAGED|OTHER
  "treatsDrinkingWater"   BOOLEAN NOT NULL DEFAULT false,
  "treatmentMethod"       TEXT,
  "waterQuality"          TEXT,   -- GOOD|ACCEPTABLE|POOR
  "poorQualityReason"     TEXT,
  "nonPotableSource"      TEXT,
  "nonPotableSufficient"  BOOLEAN NOT NULL DEFAULT true,
  "nonPotableIssues"      TEXT,
  "remarks"               TEXT,
  CONSTRAINT "WaterBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "WaterBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SanitationBaseline (Section 6)
CREATE TABLE "SanitationBaseline" (
  "assessmentId"          TEXT             NOT NULL,
  "individualToiletPct"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sharedToiletPct"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "openDefecationPct"     DOUBLE PRECISION NOT NULL DEFAULT 0,
  "communityToiletCount"  INTEGER          NOT NULL DEFAULT 0,
  "toiletSeats"           INTEGER          NOT NULL DEFAULT 0,
  "bathCount"             INTEGER          NOT NULL DEFAULT 0,
  "urinalCount"           INTEGER          NOT NULL DEFAULT 0,
  "toiletsPaid"           BOOLEAN          NOT NULL DEFAULT false,
  "toiletFee"             DOUBLE PRECISION,
  "toiletCondition"       TEXT,  -- GOOD|FAIR|POOR|NOT_USABLE
  "toiletsSufficient"     BOOLEAN          NOT NULL DEFAULT false,
  "sewerConnection"       TEXT,  -- SEWER_LINE|SEPTIC_TANK|OPEN_DRAIN|NONE
  "blockageFrequency"     TEXT,  -- FREQUENTLY|OCCASIONALLY|NO_ISSUES
  "bathingFacilities"     TEXT,  -- ADEQUATE|LIMITED|NONE
  "remarks"               TEXT,
  CONSTRAINT "SanitationBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "SanitationBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: DrainageSewerBaseline (Section 7A)
CREATE TABLE "DrainageSewerBaseline" (
  "assessmentId"      TEXT    NOT NULL,
  "disposalType"      TEXT,  -- UNDERGROUND|SEPTIC_INDIVIDUAL|SEPTIC_SHARED|OPEN_DRAINS|NONE
  "coverage"          TEXT,  -- MOST|SOME|VERY_FEW|NONE
  "condition"         TEXT,  -- GOOD|NEEDS_REPAIR|POOR
  "issues"            TEXT,  -- JSON array of issue strings
  "blockageFrequency" TEXT,  -- FREQUENTLY|OCCASIONALLY|RARE
  "safeDisposal"      BOOLEAN NOT NULL DEFAULT false,
  "remarks"           TEXT,
  CONSTRAINT "DrainageSewerBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "DrainageSewerBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: DrainageStormBaseline (Section 7B)
CREATE TABLE "DrainageStormBaseline" (
  "assessmentId"        TEXT    NOT NULL,
  "drainType"           TEXT,  -- COVERED|OPEN|MIXED|NONE
  "drainCondition"      TEXT,  -- CLEAN|PARTIALLY_CLOGGED|FULLY_CLOGGED|DAMAGED
  "connectivity"        TEXT,  -- WELL_CONNECTED|PARTIALLY|NOT_CONNECTED
  "floodingOccurs"      BOOLEAN NOT NULL DEFAULT false,
  "floodFrequency"      TEXT,  -- EVERY_RAIN|HEAVY_ONLY|OCCASIONALLY
  "floodLevel"          TEXT,  -- ANKLE|KNEE|ABOVE_KNEE
  "stagnationDuration"  TEXT,  -- UNDER_1H|1_6H|OVER_6H|OVER_1D
  "floodCauses"         TEXT,  -- JSON array
  "floodLocations"      TEXT,
  "remarks"             TEXT,
  CONSTRAINT "DrainageStormBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "DrainageStormBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: WasteBaseline (Section 8)
CREATE TABLE "WasteBaseline" (
  "assessmentId"      TEXT    NOT NULL,
  "collectionType"    TEXT,  -- DOOR_TO_DOOR|COMMUNITY_BINS|NONE
  "frequency"         TEXT,  -- DAILY|ALTERNATE|WEEKLY|IRREGULAR
  "informalDumpsCount" INTEGER NOT NULL DEFAULT 0,
  "remarks"           TEXT,
  CONSTRAINT "WasteBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "WasteBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: ElectricityBaseline (Section 9)
CREATE TABLE "ElectricityBaseline" (
  "assessmentId"            TEXT             NOT NULL,
  "hhWithConnection"        INTEGER          NOT NULL DEFAULT 0,
  "hhWithoutConnection"     INTEGER          NOT NULL DEFAULT 0,
  "avgHoursPerDay"          DOUBLE PRECISION,
  "connectionTypes"         TEXT,  -- JSON array
  "supplyNature"            TEXT,  -- REGULAR|FREQUENT_CUTS|VERY_UNRELIABLE
  "totalStreetlights"       INTEGER          NOT NULL DEFAULT 0,
  "functionalStreetlights"  INTEGER          NOT NULL DEFAULT 0,
  "streetlightAdequacy"     TEXT,  -- ADEQUATE|FEW|NONE
  "priorityStreets"         TEXT,
  "remarks"                 TEXT,
  CONSTRAINT "ElectricityBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "ElectricityBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: FacilitiesBaseline (Section 10)
CREATE TABLE "FacilitiesBaseline" (
  "assessmentId"      TEXT             NOT NULL,
  "anganwadiCount"    INTEGER          NOT NULL DEFAULT 0,
  "hasSchool"         BOOLEAN          NOT NULL DEFAULT false,
  "hasPHC"            BOOLEAN          NOT NULL DEFAULT false,
  "hasNammaClinic"    BOOLEAN          NOT NULL DEFAULT false,
  "hasRationShop"     BOOLEAN          NOT NULL DEFAULT false,
  "hasCommunityHall"  BOOLEAN          NOT NULL DEFAULT false,
  "hasLibrary"        BOOLEAN          NOT NULL DEFAULT false,
  "hasPark"           BOOLEAN          NOT NULL DEFAULT false,
  "hasPlayground"     BOOLEAN          NOT NULL DEFAULT false,
  "distanceToSchool"  DOUBLE PRECISION,
  "distanceToHealth"  DOUBLE PRECISION,
  "distanceToBusStop" DOUBLE PRECISION,
  "remarks"           TEXT,
  CONSTRAINT "FacilitiesBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "FacilitiesBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: SafetyBaseline (Section 11)
CREATE TABLE "SafetyBaseline" (
  "assessmentId"        TEXT    NOT NULL,
  "blindSpotsCount"     INTEGER NOT NULL DEFAULT 0,
  "blindSpotTypes"      TEXT,  -- JSON array
  "activitiesObserved"  TEXT,  -- JSON array
  "remarks"             TEXT,
  CONSTRAINT "SafetyBaseline_pkey" PRIMARY KEY ("assessmentId"),
  CONSTRAINT "SafetyBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: EntitlementBaseline (per assessment per scheme)
CREATE TABLE "EntitlementBaseline" (
  "id"                  TEXT    NOT NULL,
  "assessmentId"        TEXT    NOT NULL,
  "schemeId"            TEXT    NOT NULL,
  "eligibleHouseholds"  INTEGER NOT NULL DEFAULT 0,
  "enrolledHouseholds"  INTEGER NOT NULL DEFAULT 0,
  "notes"               TEXT,
  CONSTRAINT "EntitlementBaseline_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EntitlementBaseline_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "SettlementAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EntitlementBaseline_schemeId_fkey"
    FOREIGN KEY ("schemeId") REFERENCES "EntitlementScheme"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EntitlementBaseline_assessmentId_schemeId_key"
    UNIQUE ("assessmentId", "schemeId")
);
