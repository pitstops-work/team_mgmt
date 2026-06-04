import { NextRequest } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTeamIds } from "@/lib/rbac";
import { resolveWindow, priorWindow, bucketWindow, type WindowKey, type WindowRange } from "@/lib/periodWindow";

/**
 * GET /api/ops-progress
 *
 * Powers Dashboard → Operations tab. Compares completions in a chosen window
 * against an equal-duration prior window, and surfaces regression / absolute
 * threshold alerts.
 *
 * Metrics (all measured by completion timestamp):
 *   • pitstops closed   (Pitstop.status=Done, completedAt)
 *   • activities done   (PitstopEvent.status=Done, completedAt)
 *   • checklists ticked (ChecklistItem.status=Done, completedAt)
 *   • goals closed      (Goal.status=Complete, closedAt)
 *   • follow-ups closed (ActionPoint.status=done, completedAt)
 *
 * For each metric we return: `now`, `prior`, `delta`, `deltaPct`, sparkline
 * buckets within the current window. Same shape per-domain and per-cluster.
 *
 * Thresholds (returned as `alerts` per row):
 *   • "regression"        — deltaPct ≤ -10% vs prior window
 *   • "below_baseline"    — current daily rate < 50% of trailing-90d baseline
 *                           daily rate. Cheap absolute alert that doesn't need
 *                           any per-domain target setup. Configurable targets
 *                           can layer on later — UI just reads `alerts[]`.
 *
 * Slicers (all chainable; passed through into every SQL fragment):
 *   userIds, domain, cityId, zoneId, clusterId, settlementId, goalId, pitstopId
 *
 * RBAC: caller's recursive team via getTeamIds. Owner of pitstop/goal is
 * the credit-attribution target; activity/checklist/follow-up use completedBy.
 */

export type OpsMetricKey = "pitstop" | "activity" | "checklist" | "goal" | "followup";

export type OpsMetricRow = {
  key: OpsMetricKey;
  label: string;
  now: number;
  prior: number;
  delta: number;
  deltaPct: number | null;     // null = prior was 0 (delta undefined)
  spark: number[];             // bucket counts within current window
  alerts: ("regression" | "below_baseline")[];
};

export type OpsGroupRow = {
  id: string;                  // domain string, clusterId, etc.
  name: string;
  metrics: Partial<Record<OpsMetricKey, { now: number; prior: number; delta: number; deltaPct: number | null; spark: number[] }>>;
  total: { now: number; prior: number; delta: number; deltaPct: number | null };
  alerts: ("regression" | "below_baseline")[];
};

export type OpsResponse = {
  window: { from: string; to: string; label: string };
  prior:  { from: string; to: string; label: string };
  baseline: { from: string; to: string; label: string };
  metrics: OpsMetricRow[];
  byDomain: OpsGroupRow[];
  byCluster: OpsGroupRow[];
  hero: {
    overallNow: number;
    overallPrior: number;
    overallDelta: number;
    overallDeltaPct: number | null;
    topGainer:    { id: string; name: string; deltaPct: number | null; kind: "domain" | "cluster" } | null;
    topRegressor: { id: string; name: string; deltaPct: number | null; kind: "domain" | "cluster" } | null;
  };
};

const REGRESSION_PCT = -10;
const BELOW_BASELINE_PCT = 0.5; // < 50% of trailing baseline daily rate

const METRIC_LABELS: Record<OpsMetricKey, string> = {
  pitstop:   "Pitstops closed",
  activity:  "Activities done",
  checklist: "Checklists ticked",
  goal:      "Goals closed",
  followup:  "Follow-ups closed",
};

// ── Shared SQL fragment builders ──────────────────────────────────────────────

type SlicerFragments = {
  ownerFilter:   Prisma.Sql; // applied to "user owning the credit"
  domainFilter:  Prisma.Sql;
  cityFilter:    Prisma.Sql;
  zoneFilter:    Prisma.Sql;
  clusterGoal:   Prisma.Sql;
  clusterPitsp: Prisma.Sql;
  settlementGoal:   Prisma.Sql;
  settlementPitsp: Prisma.Sql;
  goalIdFilter:    Prisma.Sql;
  pitstopIdFilter: Prisma.Sql;
};

function buildSlicers(opts: {
  userIds: string[];
  domain: string | null;
  cityId: string | null;
  zoneId: string | null;
  clusterId: string | null;
  settlementId: string | null;
  goalId: string | null;
  pitstopId: string | null;
  /** When true, `ownerFilter` will use "p.ownerId / g.ownerId / *.completedById" depending on entity (caller plugs in). */
  userColumn: Prisma.Sql;
}): SlicerFragments {
  const userArr = Prisma.sql`ARRAY[${Prisma.join(opts.userIds)}]::text[]`;
  return {
    ownerFilter:   Prisma.sql`AND ${opts.userColumn} = ANY(${userArr})`,
    domainFilter:  opts.domain    ? Prisma.sql`AND g."needsDomain" = ${opts.domain}` : Prisma.empty,
    cityFilter:    opts.cityId    ? Prisma.sql`AND g."needsCityId" = ${opts.cityId}` : Prisma.empty,
    zoneFilter:    opts.zoneId    ? Prisma.sql`AND g."needsZoneId" = ${opts.zoneId}` : Prisma.empty,
    clusterGoal:   opts.clusterId ? Prisma.sql`AND g."needsClusterId" = ${opts.clusterId}` : Prisma.empty,
    clusterPitsp:  opts.clusterId ? Prisma.sql`AND COALESCE(p."needsClusterId", g."needsClusterId") = ${opts.clusterId}` : Prisma.empty,
    settlementGoal: opts.settlementId ? Prisma.sql`AND g."needsSettlementId" = ${opts.settlementId}` : Prisma.empty,
    settlementPitsp: opts.settlementId ? Prisma.sql`AND COALESCE(p."needsSettlementId", g."needsSettlementId") = ${opts.settlementId}` : Prisma.empty,
    goalIdFilter:    opts.goalId    ? Prisma.sql`AND g.id = ${opts.goalId}` : Prisma.empty,
    pitstopIdFilter: opts.pitstopId ? Prisma.sql`AND p.id = ${opts.pitstopId}` : Prisma.empty,
  };
}

// ── Per-entity count queries (a single query per entity counts inside one range) ──

type CompletionRow = {
  domain: string | null;
  cluster_id: string | null;
  cluster_name: string | null;
  completed_at: Date;
};

async function pitstopCompletions(opts: {
  userIds: string[]; range: WindowRange;
  domain: string | null; cityId: string | null; zoneId: string | null;
  clusterId: string | null; settlementId: string | null;
  goalId: string | null; pitstopId: string | null;
}): Promise<CompletionRow[]> {
  const s = buildSlicers({ ...opts, userColumn: Prisma.sql`p."ownerId"` });
  return prisma.$queryRaw<CompletionRow[]>(Prisma.sql`
    SELECT
      g."needsDomain"   AS domain,
      COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
      cl.name           AS cluster_name,
      p."completedAt"   AS completed_at
    FROM "Pitstop" p
    JOIN "Goal" g ON g.id = p."goalId"
    LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
    WHERE p."deletedAt" IS NULL
      AND g."deletedAt" IS NULL
      AND p."status" = 'Done'
      AND p."completedAt" IS NOT NULL
      AND p."completedAt" >= ${opts.range.from}
      AND p."completedAt" <= ${opts.range.to}
      ${s.ownerFilter}
      ${s.domainFilter} ${s.cityFilter} ${s.zoneFilter}
      ${s.clusterPitsp} ${s.settlementPitsp}
      ${s.goalIdFilter} ${s.pitstopIdFilter}
  `);
}

async function activityCompletions(opts: {
  userIds: string[]; range: WindowRange;
  domain: string | null; cityId: string | null; zoneId: string | null;
  clusterId: string | null; settlementId: string | null;
  goalId: string | null; pitstopId: string | null;
}): Promise<CompletionRow[]> {
  const s = buildSlicers({ ...opts, userColumn: Prisma.sql`e."completedById"` });
  return prisma.$queryRaw<CompletionRow[]>(Prisma.sql`
    WITH ev AS (
      SELECT DISTINCT ON (e.id)
        g."needsDomain" AS domain,
        COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
        e."completedAt" AS completed_at
      FROM "PitstopEvent" e
      JOIN "PitstopEventPitstop" pep ON pep."eventId" = e.id
      JOIN "Pitstop" p ON p.id = pep."pitstopId"
      JOIN "Goal"    g ON g.id = p."goalId"
      WHERE e."deletedAt" IS NULL
        AND p."deletedAt" IS NULL
        AND g."deletedAt" IS NULL
        AND e."status" = 'Done'
        AND e."completedAt" IS NOT NULL
        AND e."completedAt" >= ${opts.range.from}
        AND e."completedAt" <= ${opts.range.to}
        AND e."completedById" IS NOT NULL
        ${s.ownerFilter}
        ${s.domainFilter} ${s.cityFilter} ${s.zoneFilter}
        ${s.clusterPitsp} ${s.settlementPitsp}
        ${s.goalIdFilter} ${s.pitstopIdFilter}
      ORDER BY e.id, p."order" ASC, p."startDate" ASC
    )
    SELECT ev.domain, ev.cluster_id, cl.name AS cluster_name, ev.completed_at
    FROM ev
    LEFT JOIN "Cluster" cl ON cl.id = ev.cluster_id
  `);
}

async function checklistCompletions(opts: {
  userIds: string[]; range: WindowRange;
  domain: string | null; cityId: string | null; zoneId: string | null;
  clusterId: string | null; settlementId: string | null;
  goalId: string | null; pitstopId: string | null;
}): Promise<CompletionRow[]> {
  const s = buildSlicers({ ...opts, userColumn: Prisma.sql`COALESCE(ci."completedById", ci."assigneeId")` });
  return prisma.$queryRaw<CompletionRow[]>(Prisma.sql`
    SELECT
      g."needsDomain" AS domain,
      COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
      cl.name AS cluster_name,
      ci."completedAt" AS completed_at
    FROM "ChecklistItem" ci
    JOIN "Pitstop" p ON p.id = ci."pitstopId"
    JOIN "Goal"    g ON g.id = p."goalId"
    LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
    WHERE p."deletedAt" IS NULL
      AND g."deletedAt" IS NULL
      AND ci."status" = 'Done'
      AND ci."completedAt" IS NOT NULL
      AND ci."completedAt" >= ${opts.range.from}
      AND ci."completedAt" <= ${opts.range.to}
      ${s.ownerFilter}
      ${s.domainFilter} ${s.cityFilter} ${s.zoneFilter}
      ${s.clusterPitsp} ${s.settlementPitsp}
      ${s.goalIdFilter} ${s.pitstopIdFilter}
  `);
}

async function goalCompletions(opts: {
  userIds: string[]; range: WindowRange;
  domain: string | null; cityId: string | null; zoneId: string | null;
  clusterId: string | null; settlementId: string | null;
  goalId: string | null; pitstopId: string | null;
}): Promise<CompletionRow[]> {
  // Goals don't have a pitstop FK; pitstopId slicer is silently dropped here.
  const s = buildSlicers({ ...opts, userColumn: Prisma.sql`g."ownerId"`, pitstopId: null });
  return prisma.$queryRaw<CompletionRow[]>(Prisma.sql`
    SELECT
      g."needsDomain" AS domain,
      g."needsClusterId" AS cluster_id,
      cl.name AS cluster_name,
      g."closedAt" AS completed_at
    FROM "Goal" g
    LEFT JOIN "Cluster" cl ON cl.id = g."needsClusterId"
    WHERE g."deletedAt" IS NULL
      AND g."status" = 'Complete'
      AND g."closedAt" IS NOT NULL
      AND g."closedAt" >= ${opts.range.from}
      AND g."closedAt" <= ${opts.range.to}
      ${s.ownerFilter}
      ${s.domainFilter} ${s.cityFilter} ${s.zoneFilter}
      ${s.clusterGoal} ${s.settlementGoal}
      ${s.goalIdFilter}
  `);
}

async function followupCompletions(opts: {
  userIds: string[]; range: WindowRange;
  domain: string | null; cityId: string | null; zoneId: string | null;
  clusterId: string | null; settlementId: string | null;
  goalId: string | null; pitstopId: string | null;
}): Promise<CompletionRow[]> {
  const s = buildSlicers({ ...opts, userColumn: Prisma.sql`ap."completedById"` });
  return prisma.$queryRaw<CompletionRow[]>(Prisma.sql`
    SELECT
      g."needsDomain" AS domain,
      COALESCE(p."needsClusterId", g."needsClusterId") AS cluster_id,
      cl.name AS cluster_name,
      ap."completedAt" AS completed_at
    FROM "ActionPoint" ap
    JOIN "Pitstop" p ON p.id = ap."pitstopId"
    JOIN "Goal" g    ON g.id = p."goalId"
    LEFT JOIN "Cluster" cl ON cl.id = COALESCE(p."needsClusterId", g."needsClusterId")
    WHERE ap."status" = 'done'
      AND ap."completedAt" IS NOT NULL
      AND ap."completedAt" >= ${opts.range.from}
      AND ap."completedAt" <= ${opts.range.to}
      ${s.ownerFilter}
      ${s.domainFilter} ${s.cityFilter} ${s.zoneFilter}
      ${s.clusterPitsp} ${s.settlementPitsp}
      ${s.goalIdFilter} ${s.pitstopIdFilter}
  `);
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

function deltaPct(now: number, prior: number): number | null {
  if (prior === 0) return null;
  return Math.round(((now - prior) / prior) * 1000) / 10;
}

function alertsFor(now: number, prior: number, baseline: number, currentSpanMs: number, baselineSpanMs: number): ("regression" | "below_baseline")[] {
  const out: ("regression" | "below_baseline")[] = [];
  const p = deltaPct(now, prior);
  if (p !== null && p <= REGRESSION_PCT) out.push("regression");
  // Daily-rate comparison vs baseline. Both windows can have different durations.
  const currentDaily  = currentSpanMs  > 0 ? now / (currentSpanMs / 86_400_000) : 0;
  const baselineDaily = baselineSpanMs > 0 ? baseline / (baselineSpanMs / 86_400_000) : 0;
  if (baselineDaily > 0 && currentDaily < baselineDaily * BELOW_BASELINE_PCT) out.push("below_baseline");
  return out;
}

function bucketize(rows: CompletionRow[], buckets: WindowRange[]): number[] {
  const out = new Array(buckets.length).fill(0);
  for (const r of rows) {
    const t = new Date(r.completed_at).getTime();
    for (let i = 0; i < buckets.length; i++) {
      if (t >= buckets[i].from.getTime() && t <= buckets[i].to.getTime()) {
        out[i] += 1;
        break;
      }
    }
  }
  return out;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const windowKey = (url.searchParams.get("period") ?? "this_month") as WindowKey;
  const customFrom = url.searchParams.get("from");
  const customTo = url.searchParams.get("to");

  let current: WindowRange;
  try {
    current = resolveWindow({ key: windowKey, customFrom, customTo });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Invalid period" }, { status: 400 });
  }
  const prior = priorWindow(current, windowKey);

  // Baseline = 90 days immediately before current.from. Used for the
  // "below_baseline" absolute alert.
  const baselineTo   = new Date(current.from.getTime() - 1);
  const baselineFrom = new Date(baselineTo.getTime() - 90 * 86_400_000);
  const baseline: WindowRange = { from: baselineFrom, to: baselineTo, label: "Trailing 90d" };

  const teamIds = await getTeamIds(session.user.id);
  if (teamIds.length === 0) {
    return Response.json(emptyResponse(current, prior, baseline));
  }
  const requestedUserIds = url.searchParams.get("userIds")?.split(",").filter(Boolean);
  const userIds = requestedUserIds && requestedUserIds.length > 0
    ? requestedUserIds.filter(id => teamIds.includes(id))
    : teamIds;
  if (userIds.length === 0) return Response.json(emptyResponse(current, prior, baseline));

  const sharedSlicers = {
    userIds,
    domain:       url.searchParams.get("domain"),
    cityId:       url.searchParams.get("cityId"),
    zoneId:       url.searchParams.get("zoneId"),
    clusterId:    url.searchParams.get("clusterId"),
    settlementId: url.searchParams.get("settlementId"),
    goalId:       url.searchParams.get("goalId"),
    pitstopId:    url.searchParams.get("pitstopId"),
  };

  // Three windows × five entities = 15 parallel queries.
  const [
    pNow, pPrior, pBase,
    aNow, aPrior, aBase,
    cNow, cPrior, cBase,
    gNow, gPrior, gBase,
    fNow, fPrior, fBase,
  ] = await Promise.all([
    pitstopCompletions({ ...sharedSlicers, range: current }),
    pitstopCompletions({ ...sharedSlicers, range: prior }),
    pitstopCompletions({ ...sharedSlicers, range: baseline }),
    activityCompletions({ ...sharedSlicers, range: current }),
    activityCompletions({ ...sharedSlicers, range: prior }),
    activityCompletions({ ...sharedSlicers, range: baseline }),
    checklistCompletions({ ...sharedSlicers, range: current }),
    checklistCompletions({ ...sharedSlicers, range: prior }),
    checklistCompletions({ ...sharedSlicers, range: baseline }),
    goalCompletions({ ...sharedSlicers, range: current }),
    goalCompletions({ ...sharedSlicers, range: prior }),
    goalCompletions({ ...sharedSlicers, range: baseline }),
    followupCompletions({ ...sharedSlicers, range: current }),
    followupCompletions({ ...sharedSlicers, range: prior }),
    followupCompletions({ ...sharedSlicers, range: baseline }),
  ]);

  const currentBuckets = bucketWindow(current, 7);
  const currentSpan  = current.to.getTime()  - current.from.getTime();
  const baselineSpan = baseline.to.getTime() - baseline.from.getTime();

  const metricSpec: { key: OpsMetricKey; now: CompletionRow[]; prior: CompletionRow[]; baseline: CompletionRow[] }[] = [
    { key: "pitstop",   now: pNow, prior: pPrior, baseline: pBase },
    { key: "activity",  now: aNow, prior: aPrior, baseline: aBase },
    { key: "checklist", now: cNow, prior: cPrior, baseline: cBase },
    { key: "goal",      now: gNow, prior: gPrior, baseline: gBase },
    { key: "followup",  now: fNow, prior: fPrior, baseline: fBase },
  ];

  const metrics: OpsMetricRow[] = metricSpec.map(m => {
    const now = m.now.length;
    const priorN = m.prior.length;
    const baselineN = m.baseline.length;
    return {
      key: m.key,
      label: METRIC_LABELS[m.key],
      now,
      prior: priorN,
      delta: now - priorN,
      deltaPct: deltaPct(now, priorN),
      spark: bucketize(m.now, currentBuckets),
      alerts: alertsFor(now, priorN, baselineN, currentSpan, baselineSpan),
    };
  });

  // ── By domain ───────────────────────────────────────────────────────────
  const byDomainMap = new Map<string, { id: string; name: string; rows: { key: OpsMetricKey; now: CompletionRow[]; prior: CompletionRow[]; baseline: CompletionRow[] }[] }>();
  for (const m of metricSpec) {
    for (const r of m.now) {
      const id = r.domain ?? "—";
      if (!byDomainMap.has(id)) byDomainMap.set(id, { id, name: r.domain ?? "Unassigned", rows: [] });
    }
    for (const r of m.prior) {
      const id = r.domain ?? "—";
      if (!byDomainMap.has(id)) byDomainMap.set(id, { id, name: r.domain ?? "Unassigned", rows: [] });
    }
  }
  const byDomain: OpsGroupRow[] = [...byDomainMap.values()].map(grp => {
    const out: OpsGroupRow = {
      id: grp.id,
      name: grp.name,
      metrics: {},
      total: { now: 0, prior: 0, delta: 0, deltaPct: null },
      alerts: [],
    };
    let totalNow = 0, totalPrior = 0, totalBaseline = 0;
    for (const m of metricSpec) {
      const dNow      = m.now.filter(r => (r.domain ?? "—") === grp.id);
      const dPrior    = m.prior.filter(r => (r.domain ?? "—") === grp.id);
      const dBaseline = m.baseline.filter(r => (r.domain ?? "—") === grp.id);
      out.metrics[m.key] = {
        now: dNow.length,
        prior: dPrior.length,
        delta: dNow.length - dPrior.length,
        deltaPct: deltaPct(dNow.length, dPrior.length),
        spark: bucketize(dNow, currentBuckets),
      };
      totalNow      += dNow.length;
      totalPrior    += dPrior.length;
      totalBaseline += dBaseline.length;
    }
    out.total = { now: totalNow, prior: totalPrior, delta: totalNow - totalPrior, deltaPct: deltaPct(totalNow, totalPrior) };
    out.alerts = alertsFor(totalNow, totalPrior, totalBaseline, currentSpan, baselineSpan);
    return out;
  }).sort((a, b) => b.total.now - a.total.now);

  // ── By cluster ──────────────────────────────────────────────────────────
  const byClusterMap = new Map<string, { id: string; name: string }>();
  for (const m of metricSpec) {
    for (const r of m.now) if (r.cluster_id && r.cluster_name) byClusterMap.set(r.cluster_id, { id: r.cluster_id, name: r.cluster_name });
    for (const r of m.prior) if (r.cluster_id && r.cluster_name) byClusterMap.set(r.cluster_id, { id: r.cluster_id, name: r.cluster_name });
  }
  const byCluster: OpsGroupRow[] = [...byClusterMap.values()].map(c => {
    const out: OpsGroupRow = {
      id: c.id,
      name: c.name,
      metrics: {},
      total: { now: 0, prior: 0, delta: 0, deltaPct: null },
      alerts: [],
    };
    let totalNow = 0, totalPrior = 0, totalBaseline = 0;
    for (const m of metricSpec) {
      const cNow      = m.now.filter(r => r.cluster_id === c.id);
      const cPrior    = m.prior.filter(r => r.cluster_id === c.id);
      const cBaseline = m.baseline.filter(r => r.cluster_id === c.id);
      out.metrics[m.key] = {
        now: cNow.length,
        prior: cPrior.length,
        delta: cNow.length - cPrior.length,
        deltaPct: deltaPct(cNow.length, cPrior.length),
        spark: bucketize(cNow, currentBuckets),
      };
      totalNow      += cNow.length;
      totalPrior    += cPrior.length;
      totalBaseline += cBaseline.length;
    }
    out.total = { now: totalNow, prior: totalPrior, delta: totalNow - totalPrior, deltaPct: deltaPct(totalNow, totalPrior) };
    out.alerts = alertsFor(totalNow, totalPrior, totalBaseline, currentSpan, baselineSpan);
    return out;
  }).sort((a, b) => b.total.now - a.total.now);

  // ── Hero synthesis ──────────────────────────────────────────────────────
  const overallNow   = metrics.reduce((n, m) => n + m.now, 0);
  const overallPrior = metrics.reduce((n, m) => n + m.prior, 0);
  const allGroups: { id: string; name: string; deltaPct: number | null; kind: "domain" | "cluster" }[] = [
    ...byDomain.map(d => ({ id: d.id, name: d.name, deltaPct: d.total.deltaPct, kind: "domain" as const })),
    ...byCluster.map(c => ({ id: c.id, name: c.name, deltaPct: c.total.deltaPct, kind: "cluster" as const })),
  ];
  // Top gainer + regressor — restrict to groups with at least 3 items so a
  // single +1 jump from 0→1 doesn't dominate the hero line.
  const meaningful = allGroups.filter(g => {
    const grp = g.kind === "domain"
      ? byDomain.find(x => x.id === g.id)
      : byCluster.find(x => x.id === g.id);
    return grp ? (grp.total.now + grp.total.prior) >= 3 : false;
  });
  const topGainer = meaningful
    .filter(g => g.deltaPct !== null && g.deltaPct > 0)
    .sort((a, b) => (b.deltaPct ?? 0) - (a.deltaPct ?? 0))[0] ?? null;
  const topRegressor = meaningful
    .filter(g => g.deltaPct !== null && g.deltaPct < 0)
    .sort((a, b) => (a.deltaPct ?? 0) - (b.deltaPct ?? 0))[0] ?? null;

  return Response.json({
    window:   { from: current.from.toISOString(),  to: current.to.toISOString(),  label: current.label },
    prior:    { from: prior.from.toISOString(),    to: prior.to.toISOString(),    label: prior.label },
    baseline: { from: baseline.from.toISOString(), to: baseline.to.toISOString(), label: baseline.label },
    metrics,
    byDomain,
    byCluster,
    hero: {
      overallNow,
      overallPrior,
      overallDelta: overallNow - overallPrior,
      overallDeltaPct: deltaPct(overallNow, overallPrior),
      topGainer,
      topRegressor,
    },
  } satisfies OpsResponse);
}

function emptyResponse(current: WindowRange, prior: WindowRange, baseline: WindowRange): OpsResponse {
  return {
    window:   { from: current.from.toISOString(),  to: current.to.toISOString(),  label: current.label },
    prior:    { from: prior.from.toISOString(),    to: prior.to.toISOString(),    label: prior.label },
    baseline: { from: baseline.from.toISOString(), to: baseline.to.toISOString(), label: baseline.label },
    metrics: (["pitstop","activity","checklist","goal","followup"] as OpsMetricKey[]).map(k => ({
      key: k, label: METRIC_LABELS[k], now: 0, prior: 0, delta: 0, deltaPct: null, spark: [0,0,0,0,0,0,0], alerts: [],
    })),
    byDomain: [],
    byCluster: [],
    hero: { overallNow: 0, overallPrior: 0, overallDelta: 0, overallDeltaPct: null, topGainer: null, topRegressor: null },
  };
}
