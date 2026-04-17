/**
 * Reads creches.geojson, children_centres.geojson, youth_centres.geojson
 * and upserts SettlementAssessment rows so that existingCreches,
 * existingChildrenCentres, existingYouthResourceCentres reflect
 * what's actually on the ground in Bangalore.
 *
 * Run with:
 *   DATABASE_URL="<direct neon url>" npx tsx scripts/seed-facility-assessments.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as fs from "fs";
import * as path from "path";

const connectionString = process.env.DATABASE_URL ?? "";
const adapter = new PrismaPg({ connectionString, max: 1 });
const prisma = new PrismaClient({ adapter } as never);

const DATA_DIR = path.join(__dirname, "../public/data");

interface GeoFeature {
  properties: {
    matched_settlement?: string;
    cluster?: string;
    zone?: string;
    centre_type?: string;
  };
}

function loadGeo(file: string): GeoFeature[] {
  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
  return raw.features ?? [];
}

// Normalise a name for fuzzy matching
function norm(s: string) {
  return s.toLowerCase().replace(/[_\-\s]+/g, " ").trim();
}

async function main() {
  // Load all Bangalore settlements with their cluster/zone info
  const allSettlements = await prisma.settlement.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      cluster: { select: { name: true, zone: { select: { name: true, city: { select: { name: true } } } } } },
    },
  });

  const bangaloreSettlements = allSettlements.filter(
    s => s.cluster.zone.city?.name.toLowerCase().includes("bangalore")
  );

  console.log(`Loaded ${bangaloreSettlements.length} Bangalore settlements from DB`);

  // Build lookup: normalised name → settlement id (for matching)
  const byName = new Map<string, typeof bangaloreSettlements[0]>();
  for (const s of bangaloreSettlements) {
    byName.set(norm(s.name), s);
  }

  // Per-settlement facility counts
  const counts: Record<string, { existingCreches: number; existingChildrenCentres: number; existingYouthResourceCentres: number }> = {};

  function addFacility(geojsonFile: string, field: "existingCreches" | "existingChildrenCentres" | "existingYouthResourceCentres") {
    const features = loadGeo(geojsonFile);
    let matched = 0, unmatched = 0;
    for (const f of features) {
      const sName = (f.properties.matched_settlement ?? "").trim();
      if (!sName) { unmatched++; continue; }
      const settlement = byName.get(norm(sName));
      if (!settlement) {
        // Try partial match
        let found: typeof bangaloreSettlements[0] | undefined;
        for (const [k, v] of byName) {
          if (k.includes(norm(sName)) || norm(sName).includes(k)) { found = v; break; }
        }
        if (!found) {
          console.warn(`  ✗ No match for settlement: "${sName}" (cluster: ${f.properties.cluster})`);
          unmatched++;
          continue;
        }
        counts[found.id] ??= { existingCreches: 0, existingChildrenCentres: 0, existingYouthResourceCentres: 0 };
        counts[found.id][field]++;
        matched++;
      } else {
        counts[settlement.id] ??= { existingCreches: 0, existingChildrenCentres: 0, existingYouthResourceCentres: 0 };
        counts[settlement.id][field]++;
        matched++;
      }
    }
    console.log(`  ${geojsonFile}: ${matched} matched, ${unmatched} unmatched out of ${features.length}`);
  }

  console.log("\nLoading GeoJSON facilities...");
  addFacility("creches.geojson",          "existingCreches");
  addFacility("children_centres.geojson", "existingChildrenCentres");
  addFacility("youth_centres.geojson",    "existingYouthResourceCentres");

  const settlementsWithFacilities = Object.keys(counts);
  console.log(`\n${settlementsWithFacilities.length} settlements have at least one facility`);

  // Get the admin user to use as assessedById
  const adminUser = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!adminUser) throw new Error("No users in DB");

  let created = 0, updated = 0;

  for (const settlementId of settlementsWithFacilities) {
    const c = counts[settlementId];
    const settlement = bangaloreSettlements.find(s => s.id === settlementId)!;
    const latest = await prisma.settlementAssessment.findFirst({
      where: { settlementId },
      orderBy: { assessmentYear: "desc" },
    });

    if (latest) {
      // Update existing assessment
      await prisma.settlementAssessment.update({
        where: { id: latest.id },
        data: {
          existingCreches:              c.existingCreches,
          existingChildrenCentres:      c.existingChildrenCentres,
          existingYouthResourceCentres: c.existingYouthResourceCentres,
        },
      });
      updated++;
      console.log(`  ✓ Updated: ${settlement.name} (${settlement.cluster.name}) — creches:${c.existingCreches} children:${c.existingChildrenCentres} youth:${c.existingYouthResourceCentres}`);
    } else {
      // Create minimal assessment with just the facility counts
      await prisma.settlementAssessment.create({
        data: {
          settlementId,
          assessmentYear: new Date().getFullYear(),
          assessedById: adminUser.id,
          existingCreches:              c.existingCreches,
          existingChildrenCentres:      c.existingChildrenCentres,
          existingYouthResourceCentres: c.existingYouthResourceCentres,
        },
      });
      created++;
      console.log(`  + Created: ${settlement.name} (${settlement.cluster.name}) — creches:${c.existingCreches} children:${c.existingChildrenCentres} youth:${c.existingYouthResourceCentres}`);
    }
  }

  console.log(`\nDone. Created ${created}, updated ${updated} assessments.`);
  console.log(`\nYou can now remove the AppSetting geo_count_* overrides from Settings → Field Coverage,`);
  console.log(`as the data now flows through settlement assessments directly.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
