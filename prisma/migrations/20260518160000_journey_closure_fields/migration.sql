-- Journey closure / archival metadata
ALTER TABLE "ProgrammeJourney"
  ADD COLUMN "closedAt"       TIMESTAMP(3),
  ADD COLUMN "closedReason"   TEXT,
  ADD COLUMN "closedById"     TEXT,
  ADD COLUMN "outcomeSnapshot" JSONB;

ALTER TABLE "ProgrammeJourney"
  ADD CONSTRAINT "ProgrammeJourney_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
