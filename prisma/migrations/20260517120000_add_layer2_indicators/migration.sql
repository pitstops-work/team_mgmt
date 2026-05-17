-- Layer 2 Facility / Settlement Indicators
-- Tracks ongoing state of community facilities (enrollment %, attendance, downtime, saturation)
-- Distinct from Layer 1 (needs remaining) and goal-scoped GoalMetric.
-- Fully config-driven from admin UI; no hardcoding.

-- CreateEnum
CREATE TYPE "FacilityIndicatorSource" AS ENUM ('MIS_API', 'RP_ACTIVITY', 'MANUAL_ADMIN');

-- CreateTable: FacilityIndicatorDef (config — admin-editable)
CREATE TABLE "FacilityIndicatorDef" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "domain" TEXT NOT NULL,
    "facilityLayerKey" TEXT,
    "schemeId" TEXT,
    "unit" TEXT,
    "frequency" "MetricFrequency" NOT NULL DEFAULT 'Monthly',
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "targetFormula" JSONB,
    "captureSource" "FacilityIndicatorSource" NOT NULL,
    "misProviderId" TEXT,
    "misFetchConfig" JSONB,
    "staleYellowDays" INTEGER NOT NULL DEFAULT 45,
    "staleRedDays" INTEGER NOT NULL DEFAULT 90,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FacilityIndicatorDef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityIndicatorDef_key_key" ON "FacilityIndicatorDef"("key");

-- CreateTable: FacilityIndicator (per settlement × def — current state)
CREATE TABLE "FacilityIndicator" (
    "id" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "currentValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "lastCapturedAt" TIMESTAMP(3),
    "lastSource" "FacilityIndicatorSource",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FacilityIndicator_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacilityIndicator_defId_settlementId_key" ON "FacilityIndicator"("defId", "settlementId");
CREATE INDEX "FacilityIndicator_settlementId_idx" ON "FacilityIndicator"("settlementId");

-- CreateTable: FacilityIndicatorPoint (time series)
CREATE TABLE "FacilityIndicatorPoint" (
    "id" TEXT NOT NULL,
    "indicatorId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "targetValue" DOUBLE PRECISION,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "source" "FacilityIndicatorSource" NOT NULL,
    "sourceRefId" TEXT,
    "note" TEXT,
    "capturedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FacilityIndicatorPoint_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacilityIndicatorPoint_indicatorId_capturedAt_idx" ON "FacilityIndicatorPoint"("indicatorId", "capturedAt");

-- CreateTable: MISProviderConfig (e.g. Frappe Creche MIS)
CREATE TABLE "MISProviderConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "authType" TEXT NOT NULL DEFAULT 'frappe',
    "credentials" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MISProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MISProviderConfig_key_key" ON "MISProviderConfig"("key");

-- CreateTable: MISProviderSyncLog (per-run audit log)
CREATE TABLE "MISProviderSyncLog" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "pointsWritten" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "details" JSONB,
    CONSTRAINT "MISProviderSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MISProviderSyncLog_providerId_startedAt_idx" ON "MISProviderSyncLog"("providerId", "startedAt");

-- CreateTable: ActivityIndicatorBinding (template checklist item → indicator)
CREATE TABLE "ActivityIndicatorBinding" (
    "id" TEXT NOT NULL,
    "defId" TEXT NOT NULL,
    "templateSlug" TEXT NOT NULL,
    "checklistKey" TEXT NOT NULL,
    "numericField" TEXT NOT NULL DEFAULT 'value',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityIndicatorBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivityIndicatorBinding_defId_templateSlug_checklistKey_key" ON "ActivityIndicatorBinding"("defId", "templateSlug", "checklistKey");
CREATE INDEX "ActivityIndicatorBinding_templateSlug_checklistKey_idx" ON "ActivityIndicatorBinding"("templateSlug", "checklistKey");

-- Foreign keys
ALTER TABLE "FacilityIndicatorDef"
    ADD CONSTRAINT "FacilityIndicatorDef_misProviderId_fkey" FOREIGN KEY ("misProviderId") REFERENCES "MISProviderConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "FacilityIndicatorDef_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "EntitlementScheme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FacilityIndicator"
    ADD CONSTRAINT "FacilityIndicator_defId_fkey" FOREIGN KEY ("defId") REFERENCES "FacilityIndicatorDef"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "FacilityIndicator_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FacilityIndicatorPoint"
    ADD CONSTRAINT "FacilityIndicatorPoint_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "FacilityIndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "FacilityIndicatorPoint_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MISProviderSyncLog"
    ADD CONSTRAINT "MISProviderSyncLog_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MISProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityIndicatorBinding"
    ADD CONSTRAINT "ActivityIndicatorBinding_defId_fkey" FOREIGN KEY ("defId") REFERENCES "FacilityIndicatorDef"("id") ON DELETE CASCADE ON UPDATE CASCADE;
