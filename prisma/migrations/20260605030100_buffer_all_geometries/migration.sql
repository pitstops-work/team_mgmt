-- Previous view buffered ONLY centroid-only settlements; the ones with
-- real polygons were used as-is. Result: even with a 1km centroid
-- buffer, clusters stayed fragmented into 5-25 islands because the
-- settlement polygons (small bounded shapes) didn't reach their
-- neighbours.
--
-- Fix: buffer every settlement geometry outward by 500m before
-- unioning. Adjacent settlements within ~1km of each other now merge
-- into a single contiguous shape per cluster. Centroid-only settlements
-- get the same 500m halo (down from the previous 1000m — combined with
-- the union-time merging, the recognisable footprint is preserved).

DROP VIEW IF EXISTS "cluster_geometry";
CREATE VIEW "cluster_geometry" AS
SELECT
  c.id AS "clusterId",
  ST_AsGeoJSON(
    ST_Union(
      ST_CollectionExtract(
        ST_MakeValid(
          ST_Buffer(
            COALESCE(
              ST_GeomFromGeoJSON(s.polygon::text),
              ST_SetSRID(ST_MakePoint(s."centroidLng", s."centroidLat"), 4326)
            )::geography,
            500
          )::geometry
        ),
        3
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
      ST_CollectionExtract(
        ST_MakeValid(
          ST_Buffer(
            COALESCE(
              ST_GeomFromGeoJSON(s.polygon::text),
              ST_SetSRID(ST_MakePoint(s."centroidLng", s."centroidLat"), 4326)
            )::geography,
            500
          )::geometry
        ),
        3
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
