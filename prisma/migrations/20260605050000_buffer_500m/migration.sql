-- Settlement buffer: 850m → 500m. 850m collapsed 16/30 clusters into
-- single Polygons but produced 33 overlapping pairs — central Bangalore
-- (JJR Nagar / Majestic / KR Market / Rayapuram / Nagarbhavi /
-- Koramangala) ended up tangled, with Rayapuram 95% inside JJR Nagar,
-- Koramangala 52% inside Majestic. Reduce the buffer to bring those
-- overlaps down at the cost of more MultiPolygons.
--
-- Same view body, only the buffer constant changes.

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
