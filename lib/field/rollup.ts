/**
 * The manager read model for /field.
 *
 * One loader, then pure functions over its output. Every lens — by cluster, by
 * zone, by RP, by phase — is a regrouping of the SAME row set, so two views can
 * never disagree about a number. That is the doctrine lib/operations/command.ts
 * follows and the reason its lenses reconcile; the alternative (a query per
 * view) is how dashboards start contradicting each other.
 *
 * The query count is CONSTANT — seven, regardless of how many clusters are in
 * scope. The RP-facing loadClusterSummaries used to run three queries per
 * cluster in a Promise.all, which is fine for one RP's two clusters and not
 * fine for a leader looking at thirty.
 *
 * Nothing here is stored. Phase, stuckness and health are all derived, matching
 * lib/field/phase.ts's rule that phase is never persisted.
 */

import prisma from "@/lib/prisma";
import { goalInClusterFilter } from "@/lib/operations/clusters";
import { monthBounds, requiredVisitsForMonth, ymKey } from "@/lib/operations/month";
import { activeFieldDomains } from "@/lib/field/access";
import { deriveFieldPhase, deriveCurrentPhaseLabel, type FieldPhase } from "@/lib/field/phase";

const DAY_MS = 86_400_000;

export type SetupFront = {
  stepKey: string | null;
  title: string | null;
  /** Workstream name of the front step, when it carries one. */
  phaseTag: string | null;
  /** How long this intervention has sat on this step. */
  daysStuck: number;
  /** How far past the step's own due date, 0 if not overdue. */
  daysOverdue: number;
  /** Steps waiting on an unfinished predecessor. */
  blockedCount: number;
};

/**
 * A missing link in the Need → Plan → Guideline → RP → Status chain.
 *
 *   no_guideline  the intervention has no setup steps and no visit recipe, so
 *                 there is nothing to do and nothing to measure. It otherwise
 *                 reads as "Setting up · 0/0".
 *   no_cadence    live, in a domain that has a live phase, but no visit
 *                 frequency on the intervention or its domain. Required visits
 *                 is then 0, which otherwise reads as healthy.
 *   uncovered     no RP's patch (cluster assignment × domain scope) covers any
 *                 cluster this intervention resolves to. Responsibility is the
 *                 patch, not Goal.ownerId — a colleague covering the cluster is
 *                 the model — so a lone owner mismatch is not a gap.
 *
 * Reported only. Nothing here repairs a chain; that stays an operator decision.
 */
export type ChainGap = "no_guideline" | "no_cadence" | "uncovered";

export const CHAIN_GAP_LABEL: Record<ChainGap, string> = {
  no_guideline: "No guideline",
  no_cadence: "No visit schedule",
  uncovered: "No RP covering",
};

/** Pure: which links are missing. `covered` holds "cluster|domain" pairs some
 *  RP's patch covers, and "cluster|*" where an RP there is unrestricted. */
export function deriveChainGaps(f: {
  setupTotal: number; hasVisitRecipe: boolean; phase: FieldPhase; hasLivePhase: boolean;
  cadenceCount: number | null; clusterIds: string[]; domain: string; covered: Set<string>;
}): ChainGap[] {
  const gaps: ChainGap[] = [];
  if (f.setupTotal === 0 && !f.hasVisitRecipe) gaps.push("no_guideline");
  if (f.phase === "live" && f.hasLivePhase && !f.cadenceCount) gaps.push("no_cadence");
  // No cluster at all is not "uncovered": unplaced work is not /field's to show.
  if (f.clusterIds.length > 0 && !f.clusterIds.some((c) => f.covered.has(`${c}|*`) || f.covered.has(`${c}|${f.domain}`))) gaps.push("uncovered");
  return gaps;
}

export type FieldFact = {
  goalId: string;
  title: string;
  domain: string;
  domainLabel: string;
  ownerId: string;
  ownerName: string;
  /** Primary cluster for display. */
  clusterId: string | null;
  clusterName: string | null;
  /**
   * EVERY cluster this intervention resolves to. goalInClusterFilter is an OR
   * over needsClusterId / needsSettlement.clusterId / linkedFacility.clusterId,
   * and those can disagree — a goal whose settlement sits in one cluster and
   * whose facility sits in another matches both. Bucketing on a single coalesce
   * silently moves such a goal between clusters; grouping must use this.
   */
  clusterIds: string[];
  zoneId: string | null;
  zoneName: string | null;
  /** Both cities have a "Central" and a "North" zone — the label needs this. */
  cityName: string | null;
  locationName: string;

  phase: FieldPhase;
  phaseLabel: string | null;
  setupTotal: number;
  setupDone: number;
  overdueSetup: number;
  overallOverdue: boolean;
  front: SetupFront | null;

  cadenceRequired: number;
  cadenceDone: number;
  behind: boolean;
  lastVisitAt: Date | null;
  /** Closed visits per "YYYY-MM", for the heatmap. */
  visitsByMonth: Record<string, number>;

  openFollowups: number;
  overdueFollowups: number;
  oldestFollowupDays: number;

  needsAttention: boolean;
  /** Missing links in the chain. Deliberately NOT folded into needsAttention,
   *  which stays the same predicate as the RP list. */
  chainGaps: ChainGap[];
};

/**
 * Where the intervention is stuck, and for how long.
 *
 * The front step is the lowest-order step that is not Done and is not waiting
 * on an unfinished predecessor — the single-predecessor analogue of the old
 * spine's critical path (FieldStep has one `blockedByKey`, not a dependency
 * graph, which is why this is ~20 lines rather than computeCriticalPath).
 *
 * The stuck anchor ladder mirrors command.ts: when the predecessor finished,
 * else when this step itself started, else when the step became startable,
 * else the intervention's anchor. Each fallback is "the latest moment we know
 * work could have begun".
 */
export function computeSetupFront(
  steps: { stepKey: string | null; title: string; order: number; status: string; dueDate: Date | null; blockedByKey: string | null; startedAt: Date | null; completedAt: Date | null; startSlaDays: number | null; phaseTag: string | null }[],
  anchor: Date,
  now: Date,
): SetupFront | null {
  const open = steps.filter((s) => s.status !== "Done");
  if (!open.length) return null;

  const doneKeys = new Set(steps.filter((s) => s.status === "Done").map((s) => s.stepKey));
  const completedAtByKey = new Map(steps.filter((s) => s.completedAt).map((s) => [s.stepKey, s.completedAt!]));
  const isBlocked = (s: { blockedByKey: string | null }) => !!s.blockedByKey && !doneKeys.has(s.blockedByKey);

  const ordered = [...open].sort((a, b) => a.order - b.order);
  const front = ordered.find((s) => !isBlocked(s)) ?? ordered[0];

  const predDone = front.blockedByKey ? completedAtByKey.get(front.blockedByKey) ?? null : null;
  const startable = front.startSlaDays != null ? new Date(anchor.getTime() + front.startSlaDays * DAY_MS) : null;
  const stuckAnchor = predDone ?? front.startedAt ?? (startable && startable < now ? startable : null) ?? anchor;

  const daysStuck = Math.max(0, Math.floor((now.getTime() - stuckAnchor.getTime()) / DAY_MS));
  const daysOverdue = front.dueDate && front.dueDate < now ? Math.floor((now.getTime() - front.dueDate.getTime()) / DAY_MS) : 0;

  return {
    stepKey: front.stepKey,
    title: front.title,
    phaseTag: front.phaseTag,
    daysStuck,
    daysOverdue,
    blockedCount: open.filter(isBlocked).length,
  };
}

export type FieldClusterStatus = "critical" | "attention" | "healthy";

/**
 * Same numbers and shape as lib/operations/oversight.ts, deliberately: a manager
 * reading both dashboards must not have to learn two meanings of "amber". The
 * one substitution is overdueFollowups for the legacy pendingApprovals term,
 * which has no /field equivalent (approvals were dropped in the rebuild).
 */
export const FIELD_HEALTH_THRESHOLDS = {
  criticalOverdue: 10,
  attentionOverdue: 3,
  criticalCadencePct: 0.4,
  attentionCadencePct: 0.7,
};

export function deriveFieldClusterStatus(c: {
  overdueSetup: number; cadenceDone: number; cadenceRequired: number; overdueFollowups: number;
}): FieldClusterStatus {
  const pct = c.cadenceRequired > 0 ? c.cadenceDone / c.cadenceRequired : 1;
  if (c.overdueSetup >= FIELD_HEALTH_THRESHOLDS.criticalOverdue || pct < FIELD_HEALTH_THRESHOLDS.criticalCadencePct) return "critical";
  if (
    c.overdueSetup >= FIELD_HEALTH_THRESHOLDS.attentionOverdue ||
    pct < FIELD_HEALTH_THRESHOLDS.attentionCadencePct ||
    c.overdueFollowups > 0
  ) return "attention";
  return "healthy";
}

export type FactScope = {
  /** Restrict to these clusters. Omit for "everything the active domains cover". */
  clusterIds?: string[];
  /** Restrict to these domains. Omit for all active ones. See getRpDomainScope. */
  domains?: string[] | null;
  now?: Date;
  /** How many months of closed visits to carry for the heatmap. */
  monthsBack?: number;
};

/** Load every fact the manager views need, in a fixed seven queries. */
export async function loadFieldFacts(scope: FactScope = {}): Promise<FieldFact[]> {
  const now = scope.now ?? new Date();
  const monthsBack = scope.monthsBack ?? 6;
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  // 1. active domains
  const domains = await activeFieldDomains();
  if (domains.size === 0) return [];
  if (scope.clusterIds && scope.clusterIds.length === 0) return [];
  const inScope = scope.domains ? [...domains.keys()].filter((d) => scope.domains!.includes(d)) : [...domains.keys()];
  if (inScope.length === 0) return [];

  // 2. the interventions themselves
  const goals = await prisma.goal.findMany({
    where: {
      deletedAt: null,
      needsDomain: { in: inScope },
      // Only interventions created through /field; a legacy goal sharing the
      // needsDomain is invisible to the RP screens and must be invisible here.
      fieldAnchorAt: { not: null },
      ...(scope.clusterIds ? { OR: scope.clusterIds.map(goalInClusterFilter) } : {}),
    },
    select: {
      id: true, title: true, needsDomain: true, mode: true, fieldAnchorAt: true, createdAt: true,
      overallSlaDays: true, cadenceCount: true, cadencePeriod: true,
      ownerId: true, owner: { select: { name: true } },
      needsCluster: { select: { id: true, name: true, zoneId: true, zone: { select: { name: true, city: { select: { name: true } } } } } },
      needsSettlement: { select: { name: true, cluster: { select: { id: true, name: true, zoneId: true, zone: { select: { name: true, city: { select: { name: true } } } } } } } },
      linkedFacility: { select: { name: true, cluster: { select: { id: true, name: true, zoneId: true, zone: { select: { name: true, city: { select: { name: true } } } } } } } },
    },
  });
  if (!goals.length) return [];
  const goalIds = goals.map((g) => g.id);

  const goalClusterIds = [...new Set(goals.flatMap((g) => [g.needsCluster?.id, g.needsSettlement?.cluster?.id, g.linkedFacility?.cluster?.id]).filter((x): x is string => !!x))];

  // 3-7: everything else keyed on those ids
  const [setupSteps, visitRecipe, visits, followups, rpPatches] = await Promise.all([
    prisma.fieldStep.findMany({
      where: { goalId: { in: goalIds }, kind: "Setup", deletedAt: null },
      select: { goalId: true, stepKey: true, title: true, order: true, status: true, dueDate: true, blockedByKey: true, startedAt: true, completedAt: true, startSlaDays: true, phaseTag: true },
    }),
    prisma.fieldStep.groupBy({ by: ["goalId"], where: { goalId: { in: goalIds }, kind: "Visit", deletedAt: null }, _count: { _all: true } }),
    prisma.fieldVisit.findMany({
      where: { goalId: { in: goalIds }, closedAt: { gte: windowStart } },
      select: { goalId: true, closedAt: true },
    }),
    prisma.actionPoint.findMany({
      where: { goalId: { in: goalIds }, status: "open" },
      select: { goalId: true, dueDate: true, createdAt: true },
    }),
    // Every RP whose patch touches these clusters, with their domain scope
    // (empty = unrestricted, as in getRpDomainScope).
    goalClusterIds.length
      ? prisma.user.findMany({
          where: { rpClusters: { some: { id: { in: goalClusterIds } } } },
          select: { rpClusters: { where: { id: { in: goalClusterIds } }, select: { id: true } }, rpFieldDomains: { select: { domain: true } } },
        })
      : Promise.resolve([]),
  ]);

  // "cluster|domain" pairs some RP covers; "cluster|*" when an RP there is unrestricted.
  const covered = new Set<string>();
  for (const u of rpPatches) {
    const doms = u.rpFieldDomains.map((d) => d.domain);
    for (const c of u.rpClusters) {
      if (doms.length === 0) covered.add(`${c.id}|*`);
      else for (const d of doms) covered.add(`${c.id}|${d}`);
    }
  }

  const stepsByGoal = new Map<string, typeof setupSteps>();
  for (const s of setupSteps) {
    if (!stepsByGoal.has(s.goalId)) stepsByGoal.set(s.goalId, []);
    stepsByGoal.get(s.goalId)!.push(s);
  }
  const hasRecipe = new Set(visitRecipe.filter((r) => r._count._all > 0).map((r) => r.goalId));

  const thisMonth = monthBounds(now);
  const visitAgg = new Map<string, { thisMonth: number; last: Date | null; byMonth: Record<string, number> }>();
  for (const v of visits) {
    if (!v.closedAt) continue;
    let a = visitAgg.get(v.goalId);
    if (!a) { a = { thisMonth: 0, last: null, byMonth: {} }; visitAgg.set(v.goalId, a); }
    const k = ymKey(v.closedAt);
    a.byMonth[k] = (a.byMonth[k] ?? 0) + 1;
    if (v.closedAt >= thisMonth.start && v.closedAt <= thisMonth.end) a.thisMonth++;
    if (!a.last || v.closedAt > a.last) a.last = v.closedAt;
  }

  const fuAgg = new Map<string, { open: number; overdue: number; oldestDays: number }>();
  for (const f of followups) {
    // ActionPoint.goalId is nullable — ad-hoc follow-ups live outside the
    // hierarchy entirely, and those belong to no intervention.
    if (!f.goalId) continue;
    let a = fuAgg.get(f.goalId);
    if (!a) { a = { open: 0, overdue: 0, oldestDays: 0 }; fuAgg.set(f.goalId, a); }
    a.open++;
    if (f.dueDate < now) a.overdue++;
    a.oldestDays = Math.max(a.oldestDays, Math.floor((now.getTime() - f.createdAt.getTime()) / DAY_MS));
  }

  return goals.map((g): FieldFact => {
    const cfg = domains.get(g.needsDomain ?? "");
    const steps = stepsByGoal.get(g.id) ?? [];
    const setupTotal = steps.length;
    const setupDone = steps.filter((s) => s.status === "Done").length;
    const overdueSetup = steps.filter((s) => s.status !== "Done" && s.dueDate && s.dueDate < now).length;
    const hasVisitRecipe = hasRecipe.has(g.id);
    const phase = deriveFieldPhase({ mode: g.mode, setupTotal, setupDone, hasVisitRecipe });

    const anchor = g.fieldAnchorAt ?? g.createdAt;
    const overallSlaAt = g.overallSlaDays != null ? new Date(anchor.getTime() + g.overallSlaDays * DAY_MS) : null;
    const overallOverdue = phase === "setting_up" && !!overallSlaAt && overallSlaAt < now;

    // Cluster: the coalesce gives the display cluster; the set is what grouping
    // must use, because the three paths can point at different clusters.
    const cl = g.needsCluster ?? g.needsSettlement?.cluster ?? g.linkedFacility?.cluster ?? null;
    const clusterIds = [...new Set([g.needsCluster?.id, g.needsSettlement?.cluster?.id, g.linkedFacility?.cluster?.id].filter((x): x is string => !!x))];

    const cadence = g.cadenceCount
      ? { count: g.cadenceCount, period: (g.cadencePeriod as "week" | "month") ?? "month" }
      : cfg?.cadenceCount
        ? { count: cfg.cadenceCount, period: (cfg.cadencePeriod as "week" | "month") ?? "month" }
        : null;
    const cadenceRequired = phase === "live" ? requiredVisitsForMonth(cadence, now) : 0;
    const va = visitAgg.get(g.id);
    const cadenceDone = va?.thisMonth ?? 0;
    const behind = phase === "live" && cadenceDone < cadenceRequired;

    const chainGaps = deriveChainGaps({
      setupTotal, hasVisitRecipe, phase,
      hasLivePhase: cfg?.hasLivePhase ?? true,
      cadenceCount: cadence?.count ?? null,
      clusterIds, domain: g.needsDomain ?? "", covered,
    });

    const fu = fuAgg.get(g.id);
    const openFollowups = fu?.open ?? 0;
    const overdueFollowups = fu?.overdue ?? 0;

    return {
      goalId: g.id,
      title: g.title,
      domain: g.needsDomain ?? "",
      domainLabel: cfg?.label ?? g.needsDomain ?? "",
      ownerId: g.ownerId,
      ownerName: g.owner?.name ?? "—",
      clusterId: cl?.id ?? null,
      clusterName: cl?.name ?? null,
      clusterIds,
      zoneId: cl?.zoneId ?? null,
      zoneName: cl?.zone?.name ?? null,
      cityName: cl?.zone?.city?.name ?? null,
      locationName: g.needsSettlement?.name ?? g.linkedFacility?.name ?? cl?.name ?? "—",

      phase,
      phaseLabel: phase === "setting_up" ? deriveCurrentPhaseLabel(steps) : null,
      setupTotal,
      setupDone,
      overdueSetup,
      overallOverdue,
      front: phase === "setting_up" ? computeSetupFront(steps, anchor, now) : null,

      cadenceRequired,
      cadenceDone,
      behind,
      lastVisitAt: va?.last ?? null,
      visitsByMonth: va?.byMonth ?? {},

      openFollowups,
      overdueFollowups,
      oldestFollowupDays: fu?.oldestDays ?? 0,

      // Same predicate as the RP list, so "needs attention" means one thing.
      needsAttention: overdueSetup > 0 || overallOverdue || behind || openFollowups > 0,
      chainGaps,
    };
  });
}

export type Rollup = {
  key: string;
  label: string;
  interventions: number;
  live: number;
  settingUp: number;
  done: number;
  attention: number;
  /** Interventions with at least one missing link in the chain. */
  brokenChains: number;
  overdueSetup: number;
  cadenceDone: number;
  cadenceRequired: number;
  openFollowups: number;
  overdueFollowups: number;
  /** Worst days-stuck in the group — the thing the legacy cluster card cannot show. */
  maxDaysStuck: number;
  status: FieldClusterStatus;
};

/**
 * Group facts by whatever the view needs. Cluster, zone, RP and phase lenses are
 * all just a different keyFn over the same rows.
 */
export function rollupFacts(
  facts: FieldFact[],
  keyFn: (f: FieldFact) => { key: string; label: string } | null,
): Rollup[] {
  const groups = new Map<string, { label: string; rows: FieldFact[] }>();
  for (const f of facts) {
    const k = keyFn(f);
    if (!k) continue;
    if (!groups.has(k.key)) groups.set(k.key, { label: k.label, rows: [] });
    groups.get(k.key)!.rows.push(f);
  }

  return [...groups.entries()]
    .map(([key, { label, rows }]) => summarizeFacts(rows, key, label))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** One group's numbers. rollupFacts is this over each keyFn bucket; call it
 *  directly for a membership group (factsForCluster / factsForClusters), which
 *  a single-key keyFn cannot express. An empty row set is a valid group. */
export function summarizeFacts(rows: FieldFact[], key: string, label: string): Rollup {
  const sum = (pick: (f: FieldFact) => number) => rows.reduce((n, f) => n + pick(f), 0);
  const base = {
    overdueSetup: sum((f) => f.overdueSetup),
    cadenceDone: sum((f) => f.cadenceDone),
    cadenceRequired: sum((f) => f.cadenceRequired),
    overdueFollowups: sum((f) => f.overdueFollowups),
  };
  return {
    key,
    label,
    interventions: rows.length,
    live: rows.filter((f) => f.phase === "live").length,
    settingUp: rows.filter((f) => f.phase === "setting_up").length,
    done: rows.filter((f) => f.phase === "done").length,
    attention: rows.filter((f) => f.needsAttention).length,
    brokenChains: rows.filter((f) => f.chainGaps.length > 0).length,
    ...base,
    openFollowups: sum((f) => f.openFollowups),
    maxDaysStuck: rows.reduce((n, f) => Math.max(n, f.front?.daysStuck ?? 0), 0),
    status: deriveFieldClusterStatus(base),
  };
}

/** Lenses. Each is just a grouping choice over the same facts. */
/** Groups on the PRIMARY cluster. Where a goal resolves to several (see
 *  FieldFact.clusterIds) and you need it counted under each, group with
 *  factsForCluster instead. */
export const byCluster = (f: FieldFact) => (f.clusterId ? { key: f.clusterId, label: f.clusterName ?? "—" } : { key: "__none", label: "No cluster" });

/** Facts that resolve to this cluster by ANY of the three paths — the same
 *  membership test goalInClusterFilter applies in SQL. */
export const factsForCluster = (facts: FieldFact[], clusterId: string) => facts.filter((f) => f.clusterIds.includes(clusterId));

/** Facts that resolve to ANY of these clusters, each counted once — the zone
 *  lens by membership. Pass the zone's clusters (from loadClusterZones), since
 *  FieldFact.zoneId is only the primary cluster's zone. A goal spanning two
 *  clusters in one zone counts once here and once on each cluster card, so
 *  cluster cards can legitimately sum to more than their zone. */
export const factsForClusters = (facts: FieldFact[], clusterIds: string[]) => {
  const set = new Set(clusterIds);
  return facts.filter((f) => f.clusterIds.some((c) => set.has(c)));
};

export const zoneLabel = (z: { name: string; city: { name: string } | null } | null) =>
  z ? (z.city ? `${z.name} · ${z.city.name}` : z.name) : "Unzoned";

/** Each cluster's zone, from Cluster.zoneId — NOT from whichever intervention
 *  happens to sit in it, which left empty clusters "Unzoned". */
export async function loadClusterZones(clusterIds: string[]): Promise<Map<string, { zoneId: string | null; zoneLabel: string }>> {
  if (!clusterIds.length) return new Map();
  const rows = await prisma.cluster.findMany({
    where: { id: { in: clusterIds } },
    select: { id: true, zoneId: true, zone: { select: { name: true, city: { select: { name: true } } } } },
  });
  return new Map(rows.map((c) => [c.id, { zoneId: c.zoneId, zoneLabel: zoneLabel(c.zone) }]));
}

/** Groups on the PRIMARY cluster's zone. For zone totals by membership, use
 *  factsForClusters with the zone's clusters. */
export const byZone = (f: FieldFact) =>
  f.zoneId ? { key: f.zoneId, label: f.cityName ? `${f.zoneName} · ${f.cityName}` : f.zoneName ?? "—" } : { key: "__none", label: "No zone" };
export const byOwner = (f: FieldFact) => ({ key: f.ownerId, label: f.ownerName });
export const byDomain = (f: FieldFact) => ({ key: f.domain, label: f.domainLabel });
/** Only meaningful for interventions still setting up. */
export const byPhase = (f: FieldFact) =>
  f.phase === "setting_up" ? { key: f.front?.phaseTag ?? "__untagged", label: f.front?.phaseTag ?? "Untagged" } : null;
