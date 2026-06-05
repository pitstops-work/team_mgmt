-- Derived cluster + zone polygons. Settlement coverage is the truth.
-- These views compute each cluster's polygon as the union of:
--   * any settlement polygons in the cluster (used as-is), and
--   * a 300m-radius circle around centroid-only settlements (no polygon).
-- Zone polygon = same union, walking Cluster → Settlement.
--
-- Result is shipped as GeoJSON jsonb so the map can read it without any
-- conversion in app code (mirrors how Cluster.geometry / Zone.geometry
-- were consumed). Deleted settlements / clusters / zones are excluded.
--
-- These are plain (non-materialized) views — Postgres re-evaluates them
-- on every read. With ~30 clusters × ~20 settlements that's a few ms.
-- If perf ever bites: swap to MATERIALIZED VIEW + a settlement-write
-- trigger that REFRESHes. Same query body, no app changes.

CREATE EXTENSION IF NOT EXISTS postgis;

DROP VIEW IF EXISTS "cluster_geometry";
CREATE VIEW "cluster_geometry" AS
SELECT
  c.id AS "clusterId",
  ST_AsGeoJSON(
    ST_Union(
      COALESCE(
        ST_GeomFromGeoJSON(s.polygon::text),
        ST_Buffer(
          ST_SetSRID(ST_MakePoint(s."centroidLng", s."centroidLat"), 4326)::geography,
          300
        )::geometry
      )
    )
  )::jsonb AS geometry
FROM "Cluster" c
JOIN "Settlement" s
  ON s."clusterId" = c.id
 AND s."deletedAt" IS NULL
 AND (s.polygon IS NOT NULL OR (s."centroidLat" IS NOT NULL AND s."centroidLng" IS NOT NULL))
WHERE c."deletedAt" IS NULL
GROUP BY c.id;

DROP VIEW IF EXISTS "zone_geometry";
CREATE VIEW "zone_geometry" AS
SELECT
  z.id AS "zoneId",
  ST_AsGeoJSON(
    ST_Union(
      COALESCE(
        ST_GeomFromGeoJSON(s.polygon::text),
        ST_Buffer(
          ST_SetSRID(ST_MakePoint(s."centroidLng", s."centroidLat"), 4326)::geography,
          300
        )::geometry
      )
    )
  )::jsonb AS geometry
FROM "Zone" z
JOIN "Cluster" c ON c."zoneId" = z.id AND c."deletedAt" IS NULL
JOIN "Settlement" s
  ON s."clusterId" = c.id
 AND s."deletedAt" IS NULL
 AND (s.polygon IS NOT NULL OR (s."centroidLat" IS NOT NULL AND s."centroidLng" IS NOT NULL))
WHERE z."deletedAt" IS NULL
GROUP BY z.id;
