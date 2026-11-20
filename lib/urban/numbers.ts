// The Programme screen's numbers (spec §5.4, §6.5, §8): need vs delivered,
// saturation per scheme, coverage, and the trend of outcome readings — rolled
// up city → zone → cluster → settlement.
//
// Every sum is done in SQL over three views (rule R3):
//   uo_place_ancestor         a place and everything above it (roll-ups)
//   uo_reading_latest         the latest value of each reading per effort/dimension
//   uo_settlement_assessment  the latest needs assessment per settlement
// plus uo_effort_status for each effort's phase. Saturation is always
// Σreceived ÷ Σeligible, never an average of percentages.
import prisma from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { type Actor, visibleEffortsWhere } from "./access";
import { parseSettings, type ProgrammeSettings } from "./settings";
import { todayIST, fromDb, type Ymd } from "./time";

export type PlaceRef = { id: string; level: string; name: string };

export type NumbersRow = PlaceRef & {
  lat: number | null;
  lng: number | null;
  hasChildren: boolean;
  efforts: { running: number; settingUp: number; other: number };
  /** Outcome reading totals (summed over open efforts), by reading key. Dimensioned readings are summed across values. */
  outcomes: Record<string, number>;
  /** count needs */
  need?: { need: number; remaining: number; population: number; assessed: number; settlements: number };
  /** saturation needs: per dimension value, plus "_all" across them */
  saturation?: Record<string, { received: number; eligible: number }>;
  /** places at the programme's place level under this row with ≥1 open effort */
  coverage?: { covered: number; total: number };
};

export type TrendPoint = { month: string; values: Record<string, number>; saturation: { received: number; eligible: number } | null };

export type ProgrammeNumbers = {
  programme: { id: string; key: string; name: string; settings: ProgrammeSettings };
  place: PlaceRef | null;
  crumbs: PlaceRef[];
  rows: NumbersRow[];
  total: NumbersRow;
  outcomes: { key: string; label: string; unit?: string }[];
  dims: { key: string; label: string }[];
  trend: TrendPoint[];
  needNote: string | null;
};

/** Columns of the assessment the count need may read (numbers only — never user-typed SQL). */
function assessmentColumn(name: string | undefined): string | null {
  if (!name) return null;
  const fields = Prisma.SettlementAssessmentScalarFieldEnum as Record<string, string>;
  if (!Object.values(fields).includes(name)) return null;
  // Only integer/float columns; the id/date/text columns would fail the SUM anyway.
  if (["id", "settlementId", "assessedById", "assessedAt", "createdAt"].includes(name)) return null;
  return name;
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export async function loadProgrammeNumbers(actor: Actor, programmeKey: string, placeId: string | null): Promise<ProgrammeNumbers | null> {
  void actor; // aggregates are programme-wide (can("programme.view") gates the page); effort lists are scoped separately
  const programme = await prisma.uoProgramme.findUnique({ where: { key: programmeKey } });
  if (!programme) return null;
  const parsed = parseSettings(programme.settings);
  if (!parsed.ok) return null;
  const s = parsed.settings;
  const today = todayIST();

  const place = placeId ? await prisma.uoPlace.findUnique({ where: { id: placeId }, select: { id: true, level: true, name: true } }) : null;
  if (placeId && !place) return null;
  const crumbs = place
    ? await prisma.$queryRaw<PlaceRef[]>`
        SELECT p.id, p.level, p.name FROM "uo_place_ancestor" a JOIN "uo_place" p ON p.id = a."ancestorId"
        WHERE a."placeId" = ${place.id} ORDER BY a.depth DESC`
    : [];

  const children = await prisma.uoPlace.findMany({
    where: place ? { parentId: place.id, active: true } : { parentId: null, active: true },
    select: { id: true, level: true, name: true, _count: { select: { children: { where: { active: true } } } } },
    orderBy: { name: "asc" },
  });
  // The roll-up keys: each row, plus the scope itself as the total (null scope = everything).
  const rowIds = children.map((c) => c.id);
  const scopeKey = place?.id ?? "__all__";

  // Rows and total share one query each: "ancestorId" is the row (or scope) id.
  // For the null scope, every top-level place's descendants form the total.
  const anc = Prisma.sql`(
    SELECT "placeId", "ancestorId" FROM "uo_place_ancestor" WHERE "ancestorId" = ANY(${rowIds})
    UNION ALL
    SELECT "placeId", ${scopeKey}::text FROM "uo_place_ancestor" WHERE ${place ? Prisma.sql`"ancestorId" = ${place.id}` : Prisma.sql`depth = 0`}
  )`;

  const outcomeDefs = s.readings.filter((r) => r.outcome);
  const outcomeKeys = outcomeDefs.map((r) => r.key);
  const need = s.need;
  const satKeys = need?.type === "saturation" ? [need.eligible, need.received] : [];
  const readingKeys = [...new Set([...outcomeKeys, ...satKeys])];

  const [geo, effortRows, readingRows] = await Promise.all([
    prisma.$queryRaw<{ id: string; lat: number | null; lng: number | null }[]>`
      SELECT a."ancestorId" AS id, AVG(p.lat)::float AS lat, AVG(p.lng)::float AS lng
      FROM ${anc} a JOIN "uo_place" p ON p.id = a."placeId"
      WHERE p.active AND p.lat IS NOT NULL AND p.lng IS NOT NULL GROUP BY 1`,
    prisma.$queryRaw<{ id: string; phase: string; c: bigint }[]>`
      SELECT a."ancestorId" AS id, st.phase, COUNT(*) AS c
      FROM "uo_effort" e JOIN "uo_effort_status" st ON st."effortId" = e.id JOIN ${anc} a ON a."placeId" = e."placeId"
      WHERE e."programmeId" = ${programme.id} AND e."closedAt" IS NULL GROUP BY 1, 2`,
    readingKeys.length
      ? prisma.$queryRaw<{ id: string; key: string; dimension: string; v: number }[]>`
          SELECT a."ancestorId" AS id, rl.key, rl.dimension, SUM(rl.value)::float AS v
          FROM "uo_reading_latest" rl JOIN "uo_effort" e ON e.id = rl."effortId" JOIN ${anc} a ON a."placeId" = e."placeId"
          WHERE e."programmeId" = ${programme.id} AND e."closedAt" IS NULL AND rl.key = ANY(${readingKeys})
          GROUP BY 1, 2, 3`
      : Promise.resolve([]),
  ]);

  // Count need, per settlement: max(0, floor(population ÷ per_unit) − existing), and
  // remaining = max(0, that − running efforts in the settlement), then summed.
  let needRows: { id: string; need: number; remaining: number; population: number; assessed: bigint; settlements: bigint }[] = [];
  let needNote: string | null = null;
  if (need?.type === "count") {
    const pop = assessmentColumn(need.population);
    const ex = need.existing ? assessmentColumn(need.existing) : null;
    if (!pop || (need.existing && !ex)) {
      needNote = `The need formula refers to an assessment column that doesn't exist (${!pop ? need.population : need.existing}). Fix it in the programme settings.`;
    } else {
      const popCol = Prisma.raw(`sa."${pop}"`);
      const exCol = ex ? Prisma.raw(`COALESCE(sa."${ex}", 0)`) : Prisma.raw("0");
      needRows = await prisma.$queryRaw`
        WITH running AS (
          SELECT a."ancestorId" AS "placeId", COUNT(*) AS c
          FROM "uo_effort" e JOIN "uo_effort_status" st ON st."effortId" = e.id
          JOIN "uo_place_ancestor" a ON a."placeId" = e."placeId"
          WHERE e."programmeId" = ${programme.id} AND e."closedAt" IS NULL AND st.phase = 'running'
          GROUP BY 1
        ),
        per AS (
          SELECT p.id AS "placeId",
                 sa."placeId" IS NOT NULL AS assessed,
                 COALESCE(${popCol}, 0) AS population,
                 CASE WHEN sa."placeId" IS NULL THEN 0 ELSE GREATEST(0, FLOOR(COALESCE(${popCol}, 0)::float / ${need.per_unit}::float) - ${exCol}) END AS need,
                 COALESCE(r.c, 0) AS running
          FROM "uo_place" p
          LEFT JOIN "uo_settlement_assessment" sa ON sa."placeId" = p.id
          LEFT JOIN running r ON r."placeId" = p.id
          WHERE p.level = 'settlement' AND p.active
        )
        SELECT a."ancestorId" AS id, SUM(per.need)::float AS need, SUM(GREATEST(0, per.need - per.running))::float AS remaining,
               SUM(per.population)::float AS population, COUNT(*) FILTER (WHERE per.assessed) AS assessed, COUNT(*) AS settlements
        FROM per JOIN ${anc} a ON a."placeId" = per."placeId" GROUP BY 1`;
    }
  }

  // Coverage: places at the programme's level with at least one open effort.
  const coverRows = need?.type === "saturation" || need?.type === "coverage"
    ? await prisma.$queryRaw<{ id: string; covered: bigint; total: bigint }[]>`
        SELECT a."ancestorId" AS id,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "uo_effort" e WHERE e."placeId" = p.id AND e."programmeId" = ${programme.id} AND e."closedAt" IS NULL)) AS covered,
               COUNT(*) AS total
        FROM "uo_place" p JOIN ${anc} a ON a."placeId" = p.id
        WHERE p.level = ${s.place_level} AND p.active GROUP BY 1`
    : [];

  const blank = (r: PlaceRef & { hasChildren: boolean }): NumbersRow => ({ ...r, lat: null, lng: null, efforts: { running: 0, settingUp: 0, other: 0 }, outcomes: {} });
  const byId = new Map<string, NumbersRow>();
  for (const c of children) byId.set(c.id, blank({ id: c.id, level: c.level, name: c.name, hasChildren: c._count.children > 0 }));
  const total = blank({ id: scopeKey, level: place?.level ?? "all", name: place?.name ?? "All places", hasChildren: true });
  byId.set(scopeKey, total);

  for (const g of geo) { const r = byId.get(g.id); if (r) { r.lat = g.lat; r.lng = g.lng; } }
  for (const e of effortRows) {
    const r = byId.get(e.id); if (!r) continue;
    const c = Number(e.c);
    if (e.phase === "running") r.efforts.running += c; else if (e.phase === "setting_up") r.efforts.settingUp += c; else r.efforts.other += c;
  }
  for (const x of readingRows) {
    const r = byId.get(x.id); if (!r) continue;
    if (outcomeKeys.includes(x.key)) r.outcomes[x.key] = (r.outcomes[x.key] ?? 0) + x.v;
    if (need?.type === "saturation" && (x.key === need.eligible || x.key === need.received)) {
      r.saturation ??= {};
      for (const d of [x.dimension || "_", "_all"]) {
        const cell = (r.saturation[d] ??= { received: 0, eligible: 0 });
        if (x.key === need.received) cell.received += x.v; else cell.eligible += x.v;
      }
    }
  }
  for (const x of needRows) {
    const r = byId.get(x.id); if (!r) continue;
    r.need = { need: n(x.need), remaining: n(x.remaining), population: n(x.population), assessed: Number(x.assessed), settlements: Number(x.settlements) };
  }
  for (const x of coverRows) {
    const r = byId.get(x.id); if (r) r.coverage = { covered: Number(x.covered), total: Number(x.total) };
  }

  const dims = need?.type === "saturation" ? s.dimensions[need.per] ?? [] : [];
  const trend = await loadTrend(programme.id, s, place?.id ?? null, today);

  return {
    programme: { id: programme.id, key: programme.key, name: programme.name, settings: s },
    place, crumbs,
    rows: children.map((c) => byId.get(c.id)!),
    total,
    outcomes: outcomeDefs.map((r) => ({ key: r.key, label: r.label, ...(r.unit ? { unit: r.unit } : {}) })),
    dims,
    trend,
    needNote,
  };
}

/**
 * The last six months: for each month end, the sum over efforts open at that
 * date of the latest outcome reading on or before it (and the saturation).
 */
async function loadTrend(programmeId: string, s: ProgrammeSettings, placeId: string | null, today: Ymd): Promise<TrendPoint[]> {
  const need = s.need;
  const keys = [...new Set([...s.readings.filter((r) => r.outcome).map((r) => r.key), ...(need?.type === "saturation" ? [need.eligible, need.received] : [])])];
  if (!keys.length) return [];
  const scope = placeId ? Prisma.sql`AND e."placeId" IN (SELECT "placeId" FROM "uo_place_ancestor" WHERE "ancestorId" = ${placeId})` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ me: Date; key: string; v: number }[]>`
    WITH m AS (
      SELECT (date_trunc('month', d) + interval '1 month' - interval '1 day')::date AS me
      FROM generate_series(date_trunc('month', ${today}::date) - interval '5 months', date_trunc('month', ${today}::date), interval '1 month') d
    )
    SELECT m.me, x.key, SUM(x.value)::float AS v
    FROM m CROSS JOIN LATERAL (
      SELECT DISTINCT ON (r."effortId", r.key, r.dimension) r.key, r.value
      FROM "uo_reading" r JOIN "uo_effort" e ON e.id = r."effortId"
      WHERE e."programmeId" = ${programmeId} AND r.key = ANY(${keys}) AND r."asOf" <= m.me
        AND (e."closedAt" IS NULL OR e."closedAt"::date > m.me) ${scope}
      ORDER BY r."effortId", r.key, r.dimension, r."asOf" DESC, r."updatedAt" DESC
    ) x
    GROUP BY 1, 2 ORDER BY 1`;
  const months = new Map<string, TrendPoint>();
  // Seed all six months so an empty month shows as empty, not missing.
  const [y, mo] = today.split("-").map(Number);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.set(key, { month: key, values: {}, saturation: need?.type === "saturation" ? { received: 0, eligible: 0 } : null });
  }
  for (const r of rows) {
    const key = fromDb(r.me).slice(0, 7);
    const p = months.get(key); if (!p) continue;
    if (need?.type === "saturation" && p.saturation) {
      if (r.key === need.received) p.saturation.received += r.v;
      if (r.key === need.eligible) p.saturation.eligible += r.v;
    }
    if (s.readings.some((x) => x.key === r.key && x.outcome)) p.values[r.key] = (p.values[r.key] ?? 0) + r.v;
  }
  return [...months.values()];
}

/** Open efforts of a programme at or under a place that the actor may see (the "click a place → its efforts" list). */
export async function effortsUnder(actor: Actor, programmeId: string, placeId: string | null) {
  const where = await visibleEffortsWhere(actor);
  const placeFilter = placeId
    ? { placeId: { in: (await prisma.$queryRaw<{ placeId: string }[]>`SELECT "placeId" FROM "uo_place_ancestor" WHERE "ancestorId" = ${placeId}`).map((r) => r.placeId) } }
    : {};
  return prisma.uoEffort.findMany({
    where: { AND: [where, { programmeId, closedAt: null }, placeFilter] },
    select: { id: true, title: true, placeId: true, owner: { select: { name: true, email: true } } },
    orderBy: { title: "asc" },
    take: 200,
  });
}

export function pct(received: number, eligible: number): number | null {
  return eligible > 0 ? Math.round((received / eligible) * 1000) / 10 : null;
}
