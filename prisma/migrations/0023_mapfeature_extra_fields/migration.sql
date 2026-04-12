-- Add cluster, zone, partner fields to MapFeature
ALTER TABLE "MapFeature" ADD COLUMN IF NOT EXISTS "cluster" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MapFeature" ADD COLUMN IF NOT EXISTS "zone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "MapFeature" ADD COLUMN IF NOT EXISTS "partner" TEXT NOT NULL DEFAULT '';
