-- Settlement buffer: 500m → 850m. The 500m pass left several clusters
-- still fragmented (Anekal 10 islands, Bellandur 7, Yeshwantpur 6,
-- Sarjapur Road 5, Nagarbhavi 5, Kengeri 6). At 850m, adjacent
-- settlements within ~1.7km of each other merge — most of those
-- clusters should collapse to a single Polygon, and the few that don't
-- shrink to 2-3 islands.
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
            850
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
            850
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
