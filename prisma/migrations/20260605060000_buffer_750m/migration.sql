-- Settlement buffer: 500m → 750m. Splits the difference between the
-- 500m pass (23 overlap pairs, 17 MultiPolygons) and 850m (33 overlap
-- pairs, 14 MultiPolygons).

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
            750
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
            750
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
