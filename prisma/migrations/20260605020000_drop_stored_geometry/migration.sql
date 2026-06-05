-- Cutover: cluster + zone polygons are now derived live from settlement
-- coverage via the cluster_geometry / zone_geometry views (migration
-- 20260605010000_derived_cluster_zone_views). Drop the stored columns
-- and the geometrySource lock — neither is read by anything anymore.

ALTER TABLE "Cluster"
  DROP COLUMN "geometry",
  DROP COLUMN "geometrySource";

ALTER TABLE "Zone"
  DROP COLUMN "geometry",
  DROP COLUMN "geometrySource";
