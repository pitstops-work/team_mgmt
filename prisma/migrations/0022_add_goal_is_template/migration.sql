-- Add isTemplate column to Goal table
ALTER TABLE "Goal" ADD COLUMN IF NOT EXISTS "isTemplate" BOOLEAN NOT NULL DEFAULT false;
