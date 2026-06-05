-- Replace cluster_geometry / zone_geometry with versions that defend
-- against invalid input topology.
--
-- Some settlement polygons in the wild are self-intersecting or
-- otherwise non-OGC-valid (e.g. a hand-imported Chennai polygon at
-- ~80.305, ~13.161). ST_Union(GEOMETRYCOLLECTION over invalid inputs)
-- throws "TopologyException: side location conflict".
--
-- Fix per-row: wrap each input in ST_MakeValid (snaps + fixes topology),
-- then ST_CollectionExtract(..., 3) keeps only polygon components
-- (MakeValid can return a GEOMETRYCOLLECTION of mixed dims when fixing
-- certain failures, which ST_Union rejects).
--
-- Same shape, same column names — drop-in replacement.

DROP VIEW IF EXISTS "cluster_geometry";
CREATE VIEW "cluster_geometry" AS
SELECT
  c.id AS "clusterId",
  ST_AsGeoJSON(
    ST_Union(
      ST_CollectionExtract(
        ST_MakeValid(
          COALESCE(
            ST_GeomFromGeoJSON(s.polygon::text),
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(s."centroidLng", s."centroidLat"), 4326)::geography,
              300
            )::geometry
          )
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
          COALESCE(
            ST_GeomFromGeoJSON(s.polygon::text),
            ST_Buffer(
              ST_SetSRID(ST_MakePoint(s."centroidLng", s."centroidLat"), 4326)::geography,
              300
            )::geometry
          )
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
