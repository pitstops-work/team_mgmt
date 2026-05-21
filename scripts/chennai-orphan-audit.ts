import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";
import path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "", max: 1 });
const prisma = new PrismaClient({ adapter });

async function main() {
  const city = await prisma.city.findFirst({
    where: { name: { contains: "chennai", mode: "insensitive" }, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!city) {
    console.log("No Chennai city in DB");
    return;
  }

  const zones = await prisma.zone.findMany({
    where: { cityId: city.id, deletedAt: null },
    select: { id: true },
  });
  const zoneIds = zones.map((z) => z.id);
  const clusters = await prisma.cluster.findMany({
    where: { zoneId: { in: zoneIds }, deletedAt: null },
    select: { id: true },
  });
  const clusterIds = clusters.map((c) => c.id);
  const dbSettlements = await prisma.settlement.findMany({
    where: { clusterId: { in: clusterIds }, deletedAt: null },
    select: { id: true, name: true, polygon: true, partner: { select: { key: true } } },
  });

  const dbNames = new Set(dbSettlements.map((s) => s.name.trim().toLowerCase()));

  const partners = ["arunodhaya", "tndwwt", "dbai", "dbsss", "thozhamai"];
  const orphans: { partner: string; name: string }[] = [];
  let geoTotal = 0;
  const perPartner: Record<string, { total: number; orphan: number }> = {};
  for (const p of partners) {
    const f = path.join(process.cwd(), "public", "data", p + ".geojson");
    if (!fs.existsSync(f)) continue;
    const j = JSON.parse(fs.readFileSync(f, "utf-8")) as { features: { properties?: { name?: string } }[] };
    const feats = j.features ?? [];
    perPartner[p] = { total: feats.length, orphan: 0 };
    geoTotal += feats.length;
    for (const feat of feats) {
      const nm = (feat.properties?.name ?? "").trim();
      if (!nm) continue;
      if (!dbNames.has(nm.toLowerCase())) {
        orphans.push({ partner: p, name: nm });
        perPartner[p].orphan += 1;
      }
    }
  }

  console.log("Chennai summary:");
  console.log(`  GeoJSON polygons total: ${geoTotal}`);
  console.log(`  DB settlements:         ${dbSettlements.length}`);
  console.log(`    of which have polygon: ${dbSettlements.filter((s) => s.polygon).length}`);
  console.log(`  Orphan polygons (in GeoJSON, not in DB): ${orphans.length}`);
  console.log("");
  console.log("Per partner:");
  for (const p of partners) {
    const r = perPartner[p];
    if (!r) continue;
    console.log(`  ${p.padEnd(12)} geojson=${String(r.total).padStart(3)}  orphan=${r.orphan}`);
  }
  console.log("");
  console.log("Orphan list:");
  for (const o of orphans) {
    console.log(`  [${o.partner}] ${o.name}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
