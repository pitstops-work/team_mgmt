import { PrismaClient } from '../app/generated/prisma/client';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const DEMO_PREFIX = 'demo_';

// Spread of "days ago" buckets so a single domain hits every staleness colour
// when there are multiple goals contributing. Each goal picks ONE bucket.
const STALENESS_BUCKETS = [
  { daysAgo: 15, label: 'green'  },
  { daysAgo: 45, label: 'green'  },
  { daysAgo: 80, label: 'yellow' },
  { daysAgo: 100, label: 'yellow' },
  { daysAgo: 150, label: 'red'   },
  { daysAgo: 200, label: 'red'   },
];

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  const clearOnly = process.argv.includes('--clear');

  // Always start by purging existing demo rows (idempotent re-seed).
  const purged = await prisma.goalOutcome.deleteMany({
    where: { id: { startsWith: DEMO_PREFIX } },
  });
  console.log(`Purged ${purged.count} prior demo GoalOutcome row(s).`);
  if (clearOnly) { await pool.end(); return; }

  // Active facility/programme domains (skip entitlement/civic — they're excluded from /effects too)
  const domains = await prisma.needsFormulaConfig.findMany({
    where: { isActive: true, domainType: { notIn: ['entitlement', 'civic'] } },
    select: { domain: true, label: true },
    orderBy: { sortOrder: 'asc' },
  });

  const cities = await prisma.city.findMany({ select: { id: true, name: true } });

  let bucketCursor = 0;
  let totalCreated = 0;

  for (const city of cities) {
    // Pre-load all settlements in this city (id → name) so we can attribute when a goal lacks narrower scope
    const citySettlements = await prisma.settlement.findMany({
      where: { deletedAt: null, cluster: { zone: { cityId: city.id } } },
      select: { id: true, clusterId: true, cluster: { select: { zoneId: true } } },
    });
    if (citySettlements.length === 0) continue;

    for (const d of domains) {
      // Pick up to 6 Active goals for this domain in this city (fewer if not enough exist)
      const goals = await prisma.goal.findMany({
        where: {
          status: 'Active',
          deletedAt: null,
          needsDomain: d.domain,
          OR: [
            { needsCityId: city.id },
            { needsZone: { cityId: city.id } },
            { needsCluster: { zone: { cityId: city.id } } },
          ],
        },
        select: { id: true, title: true, needsCityId: true, needsZoneId: true, needsClusterId: true },
        take: 6,
      });
      if (goals.length === 0) continue;

      for (const goal of goals) {
        const bucket = STALENESS_BUCKETS[bucketCursor % STALENESS_BUCKETS.length];
        bucketCursor++;

        // Find candidate settlements for attribution, respecting goal scope
        let candidates = citySettlements;
        if (goal.needsClusterId) {
          candidates = citySettlements.filter(s => s.clusterId === goal.needsClusterId);
        } else if (goal.needsZoneId) {
          candidates = citySettlements.filter(s => s.cluster?.zoneId === goal.needsZoneId);
        }
        if (candidates.length === 0) candidates = citySettlements;

        // Pick 2 distinct settlements (or 1 if only 1 available)
        const picks: typeof candidates = [];
        const seen = new Set<string>();
        while (picks.length < Math.min(2, candidates.length)) {
          const s = candidates[Math.floor(Math.random() * candidates.length)];
          if (!seen.has(s.id)) { seen.add(s.id); picks.push(s); }
        }

        const createdAt = new Date(Date.now() - bucket.daysAgo * 86400000);
        for (const s of picks) {
          const id = `${DEMO_PREFIX}${goal.id}_${s.id}`.replace(/[^a-z0-9_]/gi, '_').slice(0, 64);
          // count=1 (a single facility/programme delivered). Domains aren't all "per facility"
          // — but for the visual demo, 1 per attribution keeps step-line readable.
          try {
            await prisma.goalOutcome.create({
              data: { id, goalId: goal.id, settlementId: s.id, count: 1, createdAt },
            });
            totalCreated++;
          } catch (e) {
            // ignore unique violation in the rare case the truncated id collides
          }
        }
      }
      console.log(`  ${city.name} · ${d.domain}: seeded against ${goals.length} goal(s)`);
    }
  }

  console.log(`\nDone. Created ${totalCreated} demo GoalOutcome row(s) with id prefix "${DEMO_PREFIX}".`);
  console.log(`Re-run with --clear to remove only these rows.`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
