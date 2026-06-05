-- Track whether a Cluster/Zone polygon was drawn/seeded by hand ('manual')
-- or auto-computed as a convex hull of settlement points ('auto'). The
-- per-row recompute hooks + scripts/recompute-all-boundaries.ts skip
-- 'manual' rows so hand-drawn shapes aren't clobbered.
--
-- Existing rows default to 'manual' — the seed-spatial.ts import wrote
-- hand-drawn polygons into all bootstrapped clusters + zones, so locking
-- them down is the safe default. New auto-computed polygons (from the
-- per-settlement hooks) flip the row to 'auto'.

ALTER TABLE "Cluster"
  ADD COLUMN "geometrySource" TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE "Zone"
  ADD COLUMN "geometrySource" TEXT NOT NULL DEFAULT 'manual';
