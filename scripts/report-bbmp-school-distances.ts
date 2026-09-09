/**
 * scripts/report-bbmp-school-distances.ts
 *
 * Every BBMP school ranked by how far it is from our nearest settlement,
 * ascending. Read-only.
 *
 * Distances are computed directly (haversine, settlement centroid → school)
 * rather than read from SettlementBbmpSchool, so schools with NO settlement
 * inside the layer's tagging radius still appear with their true nearest
 * settlement instead of being dropped.
 *
 * Writes:
 *   bbmp-school-distances.md   ranked, human-readable
 *   bbmp-school-distances.csv  one row per school↔settlement pair within --withinKm
 *                              (plus the nearest settlement, always)
 *
 * Usage: npx tsx scripts/report-bbmp-school-distances.ts [--withinKm=4]
 */
import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import fs from "fs";

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

async function main() {
  const { prisma } = await import("../lib/prisma");
  const withinKm = parseFloat(
    process.argv.find(a => a.startsWith("--withinKm="))?.replace("--withinKm=", "") ?? "4"
  );

  const allSchools = await prisma.bbmpSchool.findMany({ orderBy: { name: "asc" } });
  const schools = allSchools.filter(s => s.lat != null && s.lng != null);
  const ungeocoded = allSchools.filter(s => s.lat == null || s.lng == null);
  const settlements = await prisma.settlement.findMany({
    where: { deletedAt: null, centroidLat: { not: null }, centroidLng: { not: null } },
    select: {
      id: true,
      name: true,
      centroidLat: true,
      centroidLng: true,
      cluster: { select: { name: true, zone: { select: { name: true } } } },
    },
  });

  console.log(`${allSchools.length} BBMP schools (${schools.length} geocoded, ${ungeocoded.length} not) × ${settlements.length} settlements (withinKm=${withinKm})`);
  if (allSchools.length === 0) {
    console.error("No BBMP schools in the DB — run scripts/import-bbmp-schools.ts first.");
    process.exit(1);
  }

  // Settlement names are not unique, so identity must ride on the id.
  type Near = { id: string; name: string; cluster: string; zone: string; km: number };
  type Row = { school: typeof schools[number]; near: Near[]; nearest: Near };

  const rows: Row[] = schools.map(school => {
    const near: Near[] = [];
    let nearest: Near | null = null;

    for (const s of settlements) {
      const km = haversine(school.lat!, school.lng!, s.centroidLat!, s.centroidLng!);
      const rec: Near = {
        id: s.id,
        name: s.name,
        cluster: s.cluster?.name ?? "",
        zone: s.cluster?.zone?.name ?? "",
        km: Math.round(km * 1000) / 1000,
      };
      if (km <= withinKm) near.push(rec);
      if (!nearest || km < nearest.km) nearest = rec;
    }

    near.sort((a, b) => a.km - b.km);
    return { school, near, nearest: nearest! };
  });

  // Ascending by distance to the nearest settlement
  rows.sort((a, b) => a.nearest.km - b.nearest.km);

  const loc = (n: Near) => (n.cluster ? `[${n.cluster}${n.zone ? " / " + n.zone : ""}]` : "");
  const dist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`);

  const withAny = rows.filter(r => r.near.length > 0).length;
  const totalPairs = rows.reduce((acc, r) => acc + r.near.length, 0);

  // ── Markdown ────────────────────────────────────────────────────────────────
  const md: string[] = [];
  md.push(`# BBMP schools by distance to our nearest settlement`);
  md.push("");
  md.push(
    `${rows.length} geocoded BBMP schools, ranked ascending by distance from the nearest of our ` +
    `${settlements.length} settlements (haversine, settlement centroid → school). ` +
    `${withAny} schools have at least one settlement within ${withinKm} km ` +
    `(${totalPairs} school–settlement pairs in total).`
  );
  md.push("");
  md.push(`| # | BBMP school | Nearest settlement | Distance | Others within ${withinKm} km |`);
  md.push(`|---|---|---|---|---|`);
  rows.forEach((r, i) => {
    const others =
      r.near.filter(n => n.id !== r.nearest.id).map(n => `${n.name} ${dist(n.km)}`).join(", ") || "—";
    md.push(
      `| ${i + 1} | ${r.school.name} | ${r.nearest.name} ${loc(r.nearest)} | ${dist(r.nearest.km)} | ${others} |`
    );
  });
  if (ungeocoded.length) {
    md.push("");
    md.push(`## Awaiting coordinates (${ungeocoded.length})`);
    md.push("");
    md.push("Present in UDISE+ but with no KGIS match, so no distance can be computed yet.");
    md.push("");
    md.push(`| UDISE code | School | Ward | Address | PIN |`);
    md.push(`|---|---|---|---|---|`);
    for (const u of ungeocoded) {
      md.push(`| ${u.udiseCode} | ${u.name} | ${u.lgdWard ?? ""} | ${u.address ?? ""} | ${u.pincode ?? ""} |`);
    }
  }
  md.push("");
  fs.writeFileSync("bbmp-school-distances.md", md.join("\n"));

  // ── CSV (one row per school↔settlement pair) ────────────────────────────────
  const csv: string[] = ["rank,udise_code,school,address,school_lat,school_lng,settlement,cluster,zone,distance_m,is_nearest"];
  rows.forEach((r, i) => {
    const pairs = r.near.length > 0 ? r.near : [r.nearest];
    for (const n of pairs) {
      csv.push(
        [
          String(i + 1),
          r.school.udiseCode,
          csvCell(r.school.name),
          csvCell(r.school.address ?? ""),
          String(r.school.lat),
          String(r.school.lng),
          csvCell(n.name),
          csvCell(n.cluster),
          csvCell(n.zone),
          String(Math.round(n.km * 1000)),
          n.id === r.nearest.id ? "yes" : "no",
        ].join(",")
      );
    }
  });
  fs.writeFileSync("bbmp-school-distances.csv", csv.join("\n"));

  console.log(`\nWrote bbmp-school-distances.md and bbmp-school-distances.csv`);
  console.log(`  ${withAny}/${rows.length} geocoded schools have a settlement within ${withinKm} km`);
  if (ungeocoded.length) console.log(`  ${ungeocoded.length} schools still awaiting coordinates (listed in the .md)`);
  console.log(`  Closest: ${rows[0].school.name} → ${rows[0].nearest.name} (${dist(rows[0].nearest.km)})`);
  console.log(`  Farthest: ${rows[rows.length - 1].school.name} → ${dist(rows[rows.length - 1].nearest.km)}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
