/**
 * Match janadhikara.org settlement survey data to Pitstop settlements
 * and seed SettlementAssessment records for matches.
 *
 * Usage:
 *   npx tsx scripts/import-janadhikara.ts [--dry-run] [--force]
 *
 *   --dry-run  Show matches/unmatched without writing anything
 *   --force    Overwrite existing assessments (default: skip if one exists)
 *
 * Matching strategy:
 *   1. Exact normalised name match
 *   2. Fuzzy match (Dice coefficient ≥ 0.80)
 *   Settlements that score below the threshold are dropped.
 *
 * Data mapped from janadhikara:
 *   total_hh_survey  → totalHouseholds
 *   elder            → elderly60plus
 *   adult/male/female/children/pms/pwd/death_reported → enumeratorNotes (JSON summary)
 */

import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: '.env.local' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');
const FUZZY_THRESHOLD = 0.80;

// ── Types ─────────────────────────────────────────────────────────────────────

interface JanaRow {
  slum_id: number;
  slum_name: string;
  zone_name: string;
  ward_name: string;
  partner_name: string;
  total_hh_survey: number;
  hhs_completed: number;
  adult: number;
  male: number;
  female: number;
  children: number;
  elder: number;
  pms: number;
  pwd: number;
  death_reported: number;
}

interface PitstopSettlement {
  id: string;
  name: string;
  clusterId: string;
  cluster: { name: string; zone: { name: string } };
}

// ── Zone mapping: janadhikara → Pitstop zone name patterns ───────────────────
// Used to break ties when the same settlement name exists in multiple zones.
const ZONE_MAP: Record<string, string[]> = {
  "yelahanka":            ["north"],
  "bangalore west":       ["west", "central"],
  "bangalore east":       ["east"],
  "bangalore south":      ["south"],
  "rajarajeshwari nagar": ["west"],
  "dasarahalli":          ["west", "north"],
  "bommanahalli":         ["south"],
  "bannerghatta":         ["south"],
  "mahadevapura":         ["east"],
  "anekal":               ["south"],
};

function zoneMatch(janaZone: string, pitstopZone: string): boolean {
  const jNorm = janaZone.toLowerCase().trim();
  const pNorm = pitstopZone.toLowerCase().trim();
  const mapped = ZONE_MAP[jNorm] ?? [];
  return mapped.some(z => pNorm.includes(z)) || pNorm.includes(jNorm) || jNorm.includes(pNorm);
}

// ── Normalise name for matching ───────────────────────────────────────────────

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[^a-z0-9 '&]/g, ' ')  // keep & and '
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Dice coefficient (bigram similarity) ─────────────────────────────────────

function bigrams(s: string): Set<string> {
  const bg = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
  return bg;
}

function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ba = bigrams(a), bb = bigrams(b);
  let shared = 0;
  for (const g of ba) if (bb.has(g)) shared++;
  return (2 * shared) / (ba.size + bb.size);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load scraped data
  const janaPath = join(__dirname, 'out', 'janadhikara-settlements.json');
  const janaRows: JanaRow[] = JSON.parse(readFileSync(janaPath, 'utf8'));
  console.log(`Loaded ${janaRows.length} rows from janadhikara export`);

  // Connect to DB
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL!, max: 1 });
  const prisma = new PrismaClient({ adapter });

  const pitstop: PitstopSettlement[] = await prisma.settlement.findMany({
    where: { deletedAt: null },
    include: { cluster: { include: { zone: true } } },
  });
  console.log(`Loaded ${pitstop.length} settlements from Pitstop DB\n`);

  // Build normalised lookup for Pitstop settlements
  const pitstopByNorm = new Map<string, PitstopSettlement[]>();
  for (const s of pitstop) {
    const key = normalise(s.name);
    if (!pitstopByNorm.has(key)) pitstopByNorm.set(key, []);
    pitstopByNorm.get(key)!.push(s);
  }

  // Match each janadhikara row to a Pitstop settlement
  type Match = { jana: JanaRow; pitstop: PitstopSettlement; score: number; method: string };
  const matches: Match[] = [];
  const unmatched: JanaRow[] = [];
  const ambiguous: { jana: JanaRow; candidates: PitstopSettlement[] }[] = [];

  for (const jana of janaRows) {
    const normJana = normalise(jana.slum_name);

    // Helper: given multiple candidates, try to resolve via zone mapping
    function resolveByZone(candidates: PitstopSettlement[]): PitstopSettlement | null {
      const zoneFiltered = candidates.filter(c => zoneMatch(jana.zone_name, c.cluster.zone.name));
      return zoneFiltered.length === 1 ? zoneFiltered[0] : null;
    }

    // 1. Exact match
    const exact = pitstopByNorm.get(normJana);
    if (exact) {
      if (exact.length === 1) {
        matches.push({ jana, pitstop: exact[0], score: 1, method: 'exact' });
        continue;
      } else {
        const resolved = resolveByZone(exact);
        if (resolved) {
          matches.push({ jana, pitstop: resolved, score: 1, method: 'exact+zone' });
        } else {
          ambiguous.push({ jana, candidates: exact });
        }
        continue;
      }
    }

    // 2. Fuzzy match — find best scoring Pitstop settlement
    let bestScore = 0;
    let bestSettlements: PitstopSettlement[] = [];
    for (const [normKey, settlements] of pitstopByNorm) {
      const score = dice(normJana, normKey);
      if (score > bestScore) {
        bestScore = score;
        bestSettlements = settlements;
      } else if (score === bestScore && score > 0) {
        bestSettlements.push(...settlements);
      }
    }

    if (bestScore >= FUZZY_THRESHOLD) {
      if (bestSettlements.length === 1) {
        matches.push({ jana, pitstop: bestSettlements[0], score: bestScore, method: `fuzzy(${bestScore.toFixed(2)})` });
      } else {
        const resolved = resolveByZone(bestSettlements);
        if (resolved) {
          matches.push({ jana, pitstop: resolved, score: bestScore, method: `fuzzy+zone(${bestScore.toFixed(2)})` });
        } else {
          ambiguous.push({ jana, candidates: bestSettlements });
        }
      }
    } else {
      unmatched.push(jana);
    }
  }

  // ── Print report ─────────────────────────────────────────────────────────────

  console.log(`=== Matching Results ===`);
  console.log(`  Matched:    ${matches.length}`);
  console.log(`  Ambiguous:  ${ambiguous.length}  (multiple Pitstop settlements with same name)`);
  console.log(`  Unmatched:  ${unmatched.length}  (no close match — will be dropped)\n`);

  if (ambiguous.length > 0) {
    console.log('--- Ambiguous (need manual resolution) ---');
    for (const { jana, candidates } of ambiguous) {
      console.log(`  "${jana.slum_name}" → [${candidates.map(c => `${c.name} (${c.cluster.zone.name}/${c.cluster.name})`).join(', ')}]`);
    }
    console.log();
  }

  if (unmatched.length > 0) {
    console.log('--- Unmatched (dropped) ---');
    for (const j of unmatched) {
      console.log(`  "${j.slum_name}" (${j.zone_name})`);
    }
    console.log();
  }

  console.log('--- Matched pairs (sample) ---');
  matches.slice(0, 10).forEach(m =>
    console.log(`  [${m.method}] "${m.jana.slum_name}" → "${m.pitstop.name}" (${m.pitstop.cluster.zone.name})`)
  );
  if (matches.length > 10) console.log(`  ... and ${matches.length - 10} more`);
  console.log();

  if (DRY_RUN) {
    console.log('DRY RUN — no records written.');
    await prisma.$disconnect();
    return;
  }

  // ── Write assessment records ──────────────────────────────────────────────────

  // Find system user (first admin or any user) to credit assessments to
  const systemUser = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!systemUser) {
    console.error('No users found in DB — cannot create assessments.');
    await prisma.$disconnect();
    return;
  }
  console.log(`Crediting assessments to user: ${systemUser.name ?? systemUser.email}`);

  let created = 0;
  let skipped = 0;
  let failed  = 0;

  for (const { jana, pitstop: settlement } of matches) {
    // Check if assessment already exists for this settlement
    const existing = await prisma.settlementAssessment.findFirst({
      where: { settlementId: settlement.id },
      orderBy: { assessedAt: 'desc' },
    });

    if (existing && !FORCE) {
      skipped++;
      continue;
    }

    // Build enumerator notes with full demographic summary
    const notes = JSON.stringify({
      source: 'Janadhikara import',
      slum_id: jana.slum_id,
      partner: jana.partner_name,
      zone: jana.zone_name,
      ward: jana.ward_name,
      male: jana.male,
      female: jana.female,
      adult: jana.adult,
      children: jana.children,
      elder: jana.elder,
      pms: jana.pms,
      pwd: jana.pwd,
      death_reported: jana.death_reported,
      hhs_completed: jana.hhs_completed,
    });

    try {
      await prisma.settlementAssessment.create({
        data: {
          settlementId:    settlement.id,
          assessmentYear:  2025,
          assessedById:    systemUser.id,
          assessedAt:      new Date('2025-01-01'),
          // Core household count
          totalHouseholds: jana.total_hh_survey,
          // Age groups — only elder maps directly; others left for field entry
          children6m3yr:   0,
          children4to14:   0,
          youth15to21:     0,
          elderly60plus:   jana.elder,
          // Existing infrastructure — left for field entry
          existingCreches:          0,
          existingChildrenCentres:  0,
          existingYouthGroups:      0,
          existingElderlyKitchens:  0,
          existingPalliativeUnits:  0,
          existingCommunityToilets: 0,
          existingWaterATMs:        0,
          // Store full demographic breakdown in notes
          enumeratorNotes: notes,
        },
      });
      created++;

      if (created % 50 === 0) process.stdout.write(`  Created ${created}...\n`);
    } catch (err) {
      console.error(`  Failed for "${jana.slum_name}":`, (err as Error).message);
      failed++;
    }
  }

  console.log(`\n=== Import Complete ===`);
  console.log(`  Created:  ${created}`);
  console.log(`  Skipped:  ${skipped}  (already had assessment — use --force to overwrite)`);
  console.log(`  Failed:   ${failed}`);
  console.log(`\nNote: totalHouseholds and elderly60plus are populated.`);
  console.log(`      children/youth age groups need field entry to drive formula targets.`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
