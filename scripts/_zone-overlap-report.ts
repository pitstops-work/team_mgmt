import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.MIGRATE_DATABASE_URL!,
  max: 1,
});

// City filter — defaults to Bangalore (what the screenshot shows). Pass "all"
// as argv[2] to include every city.
const CITY = (process.argv[2] || "Bangalore").trim();

async function main() {
  // 1) Zone-overlap pairs (which derived zone polygons actually intersect)
  const cityClause =
    CITY.toLowerCase() === "all"
      ? ""
      : `AND z.id IN (SELECT id FROM "Zone" WHERE "cityId" IN (SELECT id FROM "City" WHERE name ILIKE '${CITY}'))`;

  const pairs = await pool.query(`
    WITH zg AS (
      SELECT zg."zoneId", z.name AS zname, ST_GeomFromGeoJSON(zg.geometry::text) AS geom
      FROM zone_geometry zg
      JOIN "Zone" z ON z.id = zg."zoneId" AND z."deletedAt" IS NULL
      WHERE TRUE ${cityClause}
    )
    SELECT a.zname AS za, b.zname AS zb,
           ROUND((ST_Area(ST_Intersection(a.geom,b.geom)::geography)/1e6)::numeric, 3) AS overlap_km2
    FROM zg a JOIN zg b ON a."zoneId" < b."zoneId"
    WHERE ST_Intersects(a.geom, b.geom)
    ORDER BY overlap_km2 DESC;
  `);

  console.log(`\n================  ZONE OVERLAP PAIRS  (city=${CITY})  ================`);
  if (pairs.rows.length === 0) console.log("  (no zone polygons intersect)");
  for (const r of pairs.rows) {
    console.log(`  ${r.za}  ✕  ${r.zb}   →  ${r.overlap_km2} km² overlap`);
  }

  // 2) Per-settlement culprit analysis. For every settlement compute:
  //    - nearest settlement in its OWN zone (how isolated it is from its zone)
  //    - nearest settlement in ANY OTHER zone (+ which zone)
  //    - the list of foreign zones its 750m buffer reaches into (overlap cause)
  const rows = await pool.query(`
    WITH s AS (
      SELECT s.id, s.name, c."zoneId" AS zid, z.name AS zname,
             c.name AS cname, ci.name AS city,
             COALESCE(
               ST_Centroid(ST_GeomFromGeoJSON(s.polygon::text)),
               ST_SetSRID(ST_MakePoint(s."centroidLng", s."centroidLat"), 4326)
             ) AS g
      FROM "Settlement" s
      JOIN "Cluster" c ON c.id = s."clusterId" AND c."deletedAt" IS NULL
      JOIN "Zone" z    ON z.id = c."zoneId"     AND z."deletedAt" IS NULL
      LEFT JOIN "City" ci ON ci.id = z."cityId"
      WHERE s."deletedAt" IS NULL
        AND (s.polygon IS NOT NULL OR (s."centroidLat" IS NOT NULL AND s."centroidLng" IS NOT NULL))
        ${CITY.toLowerCase() === "all" ? "" : `AND ci.name ILIKE '${CITY}'`}
    )
    SELECT a.id, a.name, a.zname, a.cname, a.city,
           ROUND(ST_Y(a.g)::numeric, 5) AS lat,
           ROUND(ST_X(a.g)::numeric, 5) AS lng,
           same.d  AS d_same_zone,
           other.d AS d_other_zone,
           other.zname AS nearest_other_zone,
           other.name  AS nearest_other_settlement,
           nn.zname    AS nearest_any_zone,
           foreign_zones.zones AS overlaps_into
    FROM s a
    LEFT JOIN LATERAL (
      SELECT b.d FROM (
        SELECT ST_Distance(a.g::geography, b.g::geography) AS d
        FROM s b WHERE b.zid = a.zid AND b.id <> a.id
        ORDER BY a.g <-> b.g LIMIT 1
      ) b
    ) same ON TRUE
    LEFT JOIN LATERAL (
      SELECT b.zname, b.name, ST_Distance(a.g::geography, b.g::geography) AS d
      FROM s b WHERE b.zid <> a.zid
      ORDER BY a.g <-> b.g LIMIT 1
    ) other ON TRUE
    LEFT JOIN LATERAL (
      SELECT b.zname FROM s b ORDER BY a.g <-> b.g LIMIT 1
    ) nn ON TRUE
    LEFT JOIN LATERAL (
      SELECT string_agg(DISTINCT b.zname, ', ') AS zones
      FROM s b
      WHERE b.zid <> a.zid
        AND ST_DWithin(a.g::geography, b.g::geography, 1500)  -- 750m + 750m buffers touch
    ) foreign_zones ON TRUE
    ORDER BY (other.d) ASC;
  `);

  type Row = {
    id: string; name: string; zname: string; cname: string; city: string;
    lat: number | null; lng: number | null;
    d_same_zone: number | null; d_other_zone: number | null;
    nearest_other_zone: string | null; nearest_other_settlement: string | null;
    nearest_any_zone: string | null; overlaps_into: string | null;
  };

  const all = rows.rows as Row[];

  // A settlement only *causes* a zone-polygon overlap if its buffer reaches
  // into another zone (overlaps_into is non-null).
  const culprits = all.filter((r) => r.overlaps_into);

  function classify(r: Row): string {
    const dSame = r.d_same_zone == null ? Infinity : r.d_same_zone;
    const dOther = r.d_other_zone == null ? Infinity : r.d_other_zone;
    const wrongZone = r.nearest_any_zone && r.nearest_any_zone !== r.zname;
    if (wrongZone && dSame > 2500)
      return `WRONG ZONE / mislocated — sits inside ${r.nearest_other_zone}; ${km(dSame)} from nearest own-zone (${r.zname}) settlement`;
    if (dSame > 5000)
      return `OUTLIER in own zone — ${km(dSame)} from nearest ${r.zname} sibling; check coordinates`;
    if (dOther < 50)
      return `DUPLICATE POINT — ${m(dOther)} from a ${r.nearest_other_zone} settlement (${r.nearest_other_settlement}); same coordinates, swapped/duplicate tag`;
    return `Border seam — ${m(dOther)} from ${r.nearest_other_zone}; both buffers touch (may be legitimate)`;
  }
  const km = (v: number) => `${(v / 1000).toFixed(2)} km`;
  const m = (v: number) => `${Math.round(v)} m`;

  // Rank: wrong-zone/outliers first
  const ranked = culprits
    .map((r) => ({ r, why: classify(r) }))
    .sort((a, b) => {
      const score = (w: string) =>
        w.startsWith("WRONG") ? 0 : w.startsWith("OUTLIER") ? 1 : w.startsWith("DUPLICATE") ? 2 : 3;
      return score(a.why) - score(b.why);
    });

  // Markdown table for easy paste
  const lines: string[] = [];
  lines.push(`# Zone overlap report — ${CITY}`);
  lines.push("");
  lines.push("Zone polygons are the union of 750 m buffers around every settlement");
  lines.push("in the zone's clusters. Two zones overlap wherever a settlement tagged");
  lines.push("to one zone physically sits in the other zone's territory.");
  lines.push("");
  lines.push("## Overlapping zone pairs");
  lines.push("");
  lines.push("| Zone A | Zone B | Overlap area (km²) |");
  lines.push("|---|---|---|");
  for (const p of pairs.rows) lines.push(`| ${p.za} | ${p.zb} | ${p.overlap_km2} |`);
  lines.push("");

  const isError = (w: string) => !w.startsWith("Border seam");
  const errors = ranked.filter((x) => isError(x.why));
  const seams = ranked.filter((x) => !isError(x.why));

  const tableHeader = [
    "| Settlement | Assigned zone | Cluster | lat, lng | Reaches into | Dist. to nearest own-zone settlement | Why |",
    "|---|---|---|---|---|---|---|",
  ];

  lines.push(`## ⚠️ Likely data errors — fix these (${errors.length})`);
  lines.push("");
  lines.push(...tableHeader);
  for (const { r, why } of errors) {
    const dSame = r.d_same_zone == null ? "—" : km(r.d_same_zone);
    const ll = r.lat == null ? "—" : `${r.lat}, ${r.lng}`;
    lines.push(`| ${r.name} | ${r.zname} | ${r.cname} | ${ll} | ${r.overlaps_into} | ${dSame} | ${why} |`);
  }
  lines.push("");
  lines.push(`## Border-seam settlements — probably legitimate (${seams.length})`);
  lines.push("");
  lines.push("These sit close to a zone boundary so their 750 m buffers naturally");
  lines.push("touch the neighbouring zone. Only worth checking if a specific one looks wrong.");
  lines.push("");
  lines.push(...tableHeader);
  for (const { r, why } of seams) {
    const dSame = r.d_same_zone == null ? "—" : km(r.d_same_zone);
    const ll = r.lat == null ? "—" : `${r.lat}, ${r.lng}`;
    lines.push(`| ${r.name} | ${r.zname} | ${r.cname} | ${ll} | ${r.overlaps_into} | ${dSame} | ${why} |`);
  }

  console.log(`\n================  ⚠️ LIKELY DATA ERRORS (${errors.length})  ================\n`);
  for (const { r, why } of errors) {
    console.log(`• ${r.name}  [${r.zname} / ${r.cname}]  (${r.lat}, ${r.lng})`);
    console.log(`    reaches into: ${r.overlaps_into}`);
    console.log(`    ${why}\n`);
  }
  console.log(`(+ ${seams.length} border-seam settlements — see ${"zone-overlaps.md"})`);

  const fs = await import("fs");
  const out = `/Users/vishnuharikumar/new_app/zone-overlaps.md`;
  fs.writeFileSync(out, lines.join("\n"));
  console.log(`\nMarkdown written to ${out}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
