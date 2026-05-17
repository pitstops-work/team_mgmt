-- Layer 3 Programme Journeys
-- Threads connecting multiple goals (across templates / over time) under a
-- shared outcome objective. Auto-spawned per (domain, settlement) on goal
-- apply. Phases form a DAG (linear by default; admin can rewire).

CREATE TABLE "ProgrammeJourney" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "primaryDomain" TEXT,
    "settlementId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "notes" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammeJourney_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgrammeJourney_key_key" ON "ProgrammeJourney"("key");
CREATE INDEX "ProgrammeJourney_settlementId_primaryDomain_idx" ON "ProgrammeJourney"("settlementId", "primaryDomain");
CREATE INDEX "ProgrammeJourney_parentId_idx" ON "ProgrammeJourney"("parentId");

CREATE TABLE "ProgrammeJourneyPhase" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "goalId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Planned',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammeJourneyPhase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgrammeJourneyPhase_journeyId_idx" ON "ProgrammeJourneyPhase"("journeyId");
CREATE INDEX "ProgrammeJourneyPhase_goalId_idx" ON "ProgrammeJourneyPhase"("goalId");

CREATE TABLE "ProgrammeJourneyPhaseEdge" (
    "id" TEXT NOT NULL,
    "fromPhaseId" TEXT NOT NULL,
    "toPhaseId" TEXT NOT NULL,
    "label" TEXT,
    CONSTRAINT "ProgrammeJourneyPhaseEdge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgrammeJourneyPhaseEdge_fromPhaseId_toPhaseId_key"
    ON "ProgrammeJourneyPhaseEdge"("fromPhaseId", "toPhaseId");

CREATE TABLE "ProgrammeJourneyOutcome" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "captureSource" TEXT NOT NULL DEFAULT 'MANUAL_ADMIN',
    "bindingTemplateSlug" TEXT,
    "bindingChecklistKey" TEXT,
    "targetValue" DOUBLE PRECISION,
    "targetCadence" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammeJourneyOutcome_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgrammeJourneyOutcome_journeyId_key_key"
    ON "ProgrammeJourneyOutcome"("journeyId", "key");

CREATE TABLE "ProgrammeJourneyOutcomePoint" (
    "id" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "capturedById" TEXT,
    "sourceRefId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgrammeJourneyOutcomePoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProgrammeJourneyOutcomePoint_outcomeId_capturedAt_idx"
    ON "ProgrammeJourneyOutcomePoint"("outcomeId", "capturedAt");

CREATE TABLE "ProgrammeJourneyOutcomeTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "domain" TEXT,
    "notes" TEXT,
    "outcomes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProgrammeJourneyOutcomeTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProgrammeJourneyOutcomeTemplate_key_key"
    ON "ProgrammeJourneyOutcomeTemplate"("key");

-- Foreign keys
ALTER TABLE "ProgrammeJourney"
    ADD CONSTRAINT "ProgrammeJourney_settlementId_fkey"
        FOREIGN KEY ("settlementId") REFERENCES "Settlement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ProgrammeJourney_parentId_fkey"
        FOREIGN KEY ("parentId") REFERENCES "ProgrammeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProgrammeJourneyPhase"
    ADD CONSTRAINT "ProgrammeJourneyPhase_journeyId_fkey"
        FOREIGN KEY ("journeyId") REFERENCES "ProgrammeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ProgrammeJourneyPhase_goalId_fkey"
        FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProgrammeJourneyPhaseEdge"
    ADD CONSTRAINT "ProgrammeJourneyPhaseEdge_fromPhaseId_fkey"
        FOREIGN KEY ("fromPhaseId") REFERENCES "ProgrammeJourneyPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ProgrammeJourneyPhaseEdge_toPhaseId_fkey"
        FOREIGN KEY ("toPhaseId") REFERENCES "ProgrammeJourneyPhase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProgrammeJourneyOutcome"
    ADD CONSTRAINT "ProgrammeJourneyOutcome_journeyId_fkey"
        FOREIGN KEY ("journeyId") REFERENCES "ProgrammeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProgrammeJourneyOutcomePoint"
    ADD CONSTRAINT "ProgrammeJourneyOutcomePoint_outcomeId_fkey"
        FOREIGN KEY ("outcomeId") REFERENCES "ProgrammeJourneyOutcome"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ProgrammeJourneyOutcomePoint_capturedById_fkey"
        FOREIGN KEY ("capturedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
