-- Create join table: one plan item can link to many pitstops
CREATE TABLE "PlanItemPitstop" (
  "id"         TEXT NOT NULL,
  "planItemId" TEXT NOT NULL,
  "pitstopId"  TEXT NOT NULL,
  CONSTRAINT "PlanItemPitstop_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlanItemPitstop"
  ADD CONSTRAINT "PlanItemPitstop_planItemId_fkey"
  FOREIGN KEY ("planItemId") REFERENCES "PlanItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanItemPitstop"
  ADD CONSTRAINT "PlanItemPitstop_pitstopId_fkey"
  FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PlanItemPitstop_planItemId_pitstopId_key"
  ON "PlanItemPitstop"("planItemId", "pitstopId");

-- Migrate existing single-pitstop links
INSERT INTO "PlanItemPitstop" ("id", "planItemId", "pitstopId")
SELECT gen_random_uuid()::text, "id", "pitstopId"
FROM "PlanItem"
WHERE "pitstopId" IS NOT NULL AND "deletedAt" IS NULL;

-- Drop old column
ALTER TABLE "PlanItem" DROP COLUMN "pitstopId";
