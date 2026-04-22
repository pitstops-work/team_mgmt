-- Add designation to User (RP | ZL | PM | Other)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "designation" TEXT NOT NULL DEFAULT 'Other';

-- Add zone lead FK
ALTER TABLE "Zone" ADD COLUMN IF NOT EXISTS "leadId" TEXT;
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
