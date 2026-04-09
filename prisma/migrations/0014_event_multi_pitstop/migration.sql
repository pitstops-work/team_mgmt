-- Create join table: one event can link to many pitstops
CREATE TABLE "PitstopEventPitstop" (
  "id"        TEXT NOT NULL,
  "eventId"   TEXT NOT NULL,
  "pitstopId" TEXT NOT NULL,
  CONSTRAINT "PitstopEventPitstop_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PitstopEventPitstop"
  ADD CONSTRAINT "PitstopEventPitstop_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "PitstopEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PitstopEventPitstop"
  ADD CONSTRAINT "PitstopEventPitstop_pitstopId_fkey"
  FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "PitstopEventPitstop_eventId_pitstopId_key"
  ON "PitstopEventPitstop"("eventId", "pitstopId");

-- Migrate existing single-pitstop links into the join table
INSERT INTO "PitstopEventPitstop" ("id", "eventId", "pitstopId")
SELECT gen_random_uuid()::text, "id", "pitstopId"
FROM "PitstopEvent"
WHERE "pitstopId" IS NOT NULL;

-- Drop the old scalar FK column
ALTER TABLE "PitstopEvent" DROP COLUMN "pitstopId";
