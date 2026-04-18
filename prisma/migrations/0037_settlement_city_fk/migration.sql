-- Add cityId direct FK to Settlement (denormalised from cluster→zone→city chain)
ALTER TABLE "Settlement"
  ADD COLUMN IF NOT EXISTS "cityId" TEXT REFERENCES "City"("id") ON DELETE SET NULL;

-- Backfill: populate cityId from cluster.zone.cityId
UPDATE "Settlement" s
SET "cityId" = z."cityId"
FROM "Cluster" cl
JOIN "Zone" z ON z.id = cl."zoneId"
WHERE cl.id = s."clusterId"
  AND z."cityId" IS NOT NULL
  AND s."cityId" IS NULL;
