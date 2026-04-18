-- Add needsCityId to Goal for city-level operational goals
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "needsCityId" TEXT;

ALTER TABLE "Goal"
  ADD CONSTRAINT "Goal_needsCityId_fkey"
  FOREIGN KEY ("needsCityId") REFERENCES "City"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
