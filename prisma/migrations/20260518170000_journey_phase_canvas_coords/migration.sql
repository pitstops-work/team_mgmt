-- Canvas coordinates for the DAG view. NULL = auto-layout.
ALTER TABLE "ProgrammeJourneyPhase"
  ADD COLUMN "canvasX" INTEGER,
  ADD COLUMN "canvasY" INTEGER;
