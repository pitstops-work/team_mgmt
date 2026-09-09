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
 *   bbmp-school-distances.md    ranked, human-readable
 *   bbmp-school-distances.csv   one row per school↔settlement pair within --withinKm
 *                               (plus the nearest settlement, always)
 *   bbmp-school-distances.xlsx  two sheets — the ranked table, and the schools
 *                               still awaiting coordinates
 *
 * Usage: npx tsx scripts/report-bbmp-school-distances.ts [--withinKm=4]
 */
import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import fs from "fs";
import ExcelJS from "exceljs";

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

  // ── XLSX (two sheets) ───────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "pitstops";
  wb.created = new Date();

  const s1 = wb.addWorksheet("Schools by distance", { views: [{ state: "frozen", ySplit: 1 }] });
  s1.columns = [
    { header: "#", key: "rank", width: 5 },
    { header: "UDISE code", key: "udise", width: 14 },
    { header: "BBMP school", key: "school", width: 46 },
    { header: "Category", key: "category", width: 30 },
    { header: "Ward", key: "ward", width: 26 },
    { header: "Latitude", key: "lat", width: 11 },
    { header: "Longitude", key: "lng", width: 11 },
    { header: "Geocoded via", key: "src", width: 13 },
    { header: "Nearest settlement", key: "settlement", width: 28 },
    { header: "Cluster", key: "cluster", width: 18 },
    { header: "Zone", key: "zone", width: 12 },
    { header: "Distance (m)", key: "dist", width: 13 },
    { header: `Settlements within ${withinKm} km`, key: "count", width: 20 },
    { header: `Other settlements within ${withinKm} km`, key: "others", width: 90 },
  ];
  rows.forEach((r, i) => {
    s1.addRow({
      rank: i + 1,
      udise: r.school.udiseCode,
      school: r.school.name,
      category: r.school.category ?? "",
      ward: r.school.lgdWard ?? "",
      lat: r.school.lat,
      lng: r.school.lng,
      src: r.school.geocodeSource ?? "",
      settlement: r.nearest.name,
      cluster: r.nearest.cluster,
      zone: r.nearest.zone,
      dist: Math.round(r.nearest.km * 1000),
      count: r.near.length,
      others: r.near.filter(n => n.id !== r.nearest.id).map(n => `${n.name} (${Math.round(n.km * 1000)} m)`).join(", "),
    });
  });
  s1.getRow(1).font = { bold: true };
  s1.getColumn("lat").numFmt = "0.00000";
  s1.getColumn("lng").numFmt = "0.00000";
  s1.getColumn("dist").numFmt = "#,##0";
  s1.autoFilter = { from: "A1", to: { row: 1, column: s1.columnCount } };

  const s2 = wb.addWorksheet("Awaiting coordinates", { views: [{ state: "frozen", ySplit: 1 }] });
  s2.columns = [
    { header: "UDISE code", key: "udise", width: 14 },
    { header: "BBMP school", key: "school", width: 52 },
    { header: "Category", key: "category", width: 30 },
    { header: "Edu. district", key: "district", width: 20 },
    { header: "Edu. block", key: "block", width: 12 },
    { header: "LGD ward", key: "ward", width: 30 },
    { header: "Address", key: "address", width: 48 },
    { header: "PIN", key: "pin", width: 9 },
    { header: "Latitude (fill in)", key: "lat", width: 17 },
    { header: "Longitude (fill in)", key: "lng", width: 18 },
  ];
  ungeocoded.forEach(u => {
    s2.addRow({
      udise: u.udiseCode, school: u.name, category: u.category ?? "",
      district: u.eduDistrict ?? "", block: u.eduBlock ?? "",
      ward: u.lgdWard ?? "", address: u.address ?? "", pin: u.pincode ?? "",
      lat: null, lng: null,
    });
  });
  s2.getRow(1).font = { bold: true };

  await wb.xlsx.writeFile("bbmp-school-distances.xlsx");

  console.log(`\nWrote bbmp-school-distances.md, .csv and .xlsx`);
  console.log(`  ${withAny}/${rows.length} geocoded schools have a settlement within ${withinKm} km`);
  if (ungeocoded.length) console.log(`  ${ungeocoded.length} schools still awaiting coordinates (listed in the .md)`);
  console.log(`  Closest: ${rows[0].school.name} → ${rows[0].nearest.name} (${dist(rows[0].nearest.km)})`);
  console.log(`  Farthest: ${rows[rows.length - 1].school.name} → ${dist(rows[rows.length - 1].nearest.km)}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
