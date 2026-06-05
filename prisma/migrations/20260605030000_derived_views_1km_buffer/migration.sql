-- Widen the centroid-buffer radius from 300m to 1km. Most Bangalore +
-- Chennai cluster settlements sit 1-5km apart, so a 300m radius left
-- every cluster as a fragmented MultiPolygon of isolated islands —
-- visually noisy and hard to recognise as a single cluster. 1km lets
-- neighbouring settlements (within ~2km of each other) merge into a
-- single contiguous polygon per cluster, matching how the eye groups
-- them on the map.
--
-- Slight overlap between adjacent clusters at the edges is acceptable
-- — the line styling makes provenance clear, and operationally it's
-- accurate (boundary communities often relate to multiple clusters).
--
-- Same query body, only the buffer constant changes. Settlement polygons
-- (when present) are used as-is — not buffered — so high-fidelity
-- settlement outlines aren't widened.

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
              1000
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
              1000
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
