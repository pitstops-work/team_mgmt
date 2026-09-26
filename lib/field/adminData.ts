// Data for the /field backend console — the config that drives the RP frontend,
// plus a live-data snapshot so edits/actions can be watched taking effect.
import prisma from "@/lib/prisma";
import { activeFieldDomains } from "@/lib/field/access";

export type DomainBackend = {
  config: {
    domain: string; label: string; unit: string; overallSlaDays: number | null;
    cadenceCount: number | null; cadencePeriod: string | null; hasLivePhase: boolean; caregiverForm: boolean; isActive: boolean;
  };
  setupSteps: SetupRow[];
  visitSteps: VisitRow[];
  counts: { interventions: number; legacyCandidates: number; setupSteps: number; visitRecipe: number; visits: number; openFollowups: number };
};
export type SetupRow = { id: string; order: number; stepKey: string; title: string; slaDays: number | null; startSlaDays: number | null; blockedByKey: string | null; phaseTag: string | null; formKind: string | null; formSchema: unknown };
export type VisitRow = { id: string; order: number; stepKey: string; title: string; mandatory: boolean; formKind: string | null; formSchema: unknown };

/**
 * needsDomains that aren't yet configured for /field — candidates for "Add domain".
 *
 * `unit` collapses to the two grains /field models (settlement | cluster), but
 * `assessmentLevel` carries the real value so the UI can say so — FoodDistribution
 * is assessed at city level and silently presenting it as "cluster" hides a real
 * modelling decision from whoever is onboarding it.
 */
export async function loadAvailableDomains(): Promise<{ domain: string; label: string; unit: string; assessmentLevel: string }[]> {
  const [configured, all] = await Promise.all([
    prisma.fieldDomainConfig.findMany({ select: { domain: true } }),
    prisma.needsFormulaConfig.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { domain: true, label: true, assessmentLevel: true } }),
  ]);
  const taken = new Set(configured.map((c) => c.domain));
  return all
    .filter((d) => !taken.has(d.domain))
    .map((d) => ({ domain: d.domain, label: d.label ?? d.domain, unit: d.assessmentLevel === "settlement" ? "settlement" : "cluster", assessmentLevel: d.assessmentLevel ?? "cluster" }));
}

/**
 * What a domain can be derived FROM — the legacy templates and catalogs that
 * carry its recipe. Pitstop counts are surfaced because several domains have
 * near-duplicate templates (ElderlyCentre has a 13-step one and an 8-step
 * "-copy"), and picking the wrong one silently produces the wrong programme.
 */
export async function loadDerivableTemplates(domain: string): Promise<{
  setupTemplates: { slug: string; name: string; pitstops: number }[];
  catalogs: { slug: string; cadence: string }[];
  scoredIndicators: { key: string; label: string; items: number }[];
}> {
  const [templates, catalogs, indicators] = await Promise.all([
    prisma.goalTemplateDef.findMany({
      where: { needsDomain: domain, isActive: true },
      orderBy: { slug: "asc" },
      select: { slug: true, name: true, _count: { select: { pitstopDefs: true } } },
    }),
    prisma.catalogTemplateDef.findMany({
      where: { needsDomain: domain, isActive: true },
      orderBy: { slug: "asc" },
      select: { slug: true, defaultCadenceCount: true, defaultCadencePeriod: true },
    }),
    prisma.facilityIndicatorDef.findMany({
      where: { checklistItems: { some: { isActive: true } } },
      select: { key: true, label: true, _count: { select: { checklistItems: true } } },
    }),
  ]);
  return {
    setupTemplates: templates.map((t) => ({ slug: t.slug, name: t.name, pitstops: t._count.pitstopDefs })),
    catalogs: catalogs.map((c) => ({ slug: c.slug, cadence: `${c.defaultCadenceCount ?? "-"}/${c.defaultCadencePeriod ?? "-"}` })),
    scoredIndicators: indicators.map((i) => ({ key: i.key, label: i.label, items: i._count.checklistItems })),
  };
}

/** Small lists for the "create intervention" modal. */
export async function loadCreatePickers(): Promise<{
  clusters: { id: string; name: string }[];
  users: { id: string; name: string; designation: string }[];
  layerKeyByDomain: Record<string, string>;
}> {
  const [clusters, users, layers] = await Promise.all([
    prisma.cluster.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, designation: true } }),
    prisma.facilityLayerConfig.findMany({ where: { isActive: true }, select: { layerKey: true, needsDomain: true } }),
  ]);
  const layerKeyByDomain: Record<string, string> = {};
  for (const l of layers) if (l.needsDomain) layerKeyByDomain[l.needsDomain] = l.layerKey;
  return { clusters, users: users.map((u) => ({ id: u.id, name: u.name ?? "—", designation: u.designation })), layerKeyByDomain };
}

/**
 * Data for the assignments page: RP↔cluster + intervention geography.
 *
 * NOTE this list deliberately includes legacy /operations goals (fieldNative
 * false) rather than filtering on fieldAnchorAt like the RP query does. Their
 * geography has to be fixable BEFORE a backfill converts them — ElderlyCentre
 * has 11 goals with one settlement between them, WelfareRights 30 with four.
 * The UI flags them and filters by default instead of hiding them outright.
 */
export async function loadAssignments(): Promise<{
  clusters: { id: string; name: string }[];
  rps: { id: string; name: string; designation: string; clusterIds: string[]; domains: string[] }[];
  domains: { domain: string; label: string }[];
  interventions: { id: string; title: string; domain: string; unit: string; status: string; mode: string; fieldNative: boolean; ownerId: string; ownerName: string; clusterId: string | null; clusterName: string | null; settlementId: string | null; settlementName: string | null; facilityId: string | null; facilityName: string | null }[];
}> {
  const domains = await activeFieldDomains();
  const [clusters, rps, goals] = await Promise.all([
    prisma.cluster.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { designation: { in: ["RP", "ZL", "PM", "Leader"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, designation: true, rpClusters: { select: { id: true } }, rpFieldDomains: { select: { domain: true } } } }),
    prisma.goal.findMany({
      where: { deletedAt: null, needsDomain: { in: [...domains.keys()] } },
      orderBy: { title: "asc" },
      select: { id: true, title: true, needsDomain: true, status: true, mode: true, fieldAnchorAt: true, ownerId: true, owner: { select: { name: true } }, needsClusterId: true, needsSettlementId: true, linkedFacilityId: true, needsCluster: { select: { name: true } }, needsSettlement: { select: { name: true } }, linkedFacility: { select: { name: true } } },
    }),
  ]);
  return {
    clusters,
    domains: [...domains.entries()].map(([domain, cfg]) => ({ domain, label: cfg.label ?? domain })),
    rps: rps.map((u) => ({ id: u.id, name: u.name ?? "—", designation: u.designation, clusterIds: u.rpClusters.map((c) => c.id), domains: u.rpFieldDomains.map((d) => d.domain) })),
    interventions: goals.map((g) => ({
      id: g.id, title: g.title, domain: g.needsDomain ?? "", unit: domains.get(g.needsDomain ?? "")?.unit ?? "settlement",
      status: g.status, mode: g.mode, fieldNative: g.fieldAnchorAt != null, ownerId: g.ownerId, ownerName: g.owner?.name ?? "—",
      clusterId: g.needsClusterId, clusterName: g.needsCluster?.name ?? null,
      settlementId: g.needsSettlementId, settlementName: g.needsSettlement?.name ?? null,
      facilityId: g.linkedFacilityId, facilityName: g.linkedFacility?.name ?? null,
    })),
  };
}

/**
 * Backend console data.
 *
 * Counts are split field-native vs legacy on purpose. `fieldAnchorAt != null` is
 * the discriminator for "created through /field" (only materialize.ts stamps
 * it); every other goal sharing the needsDomain is a legacy /operations goal
 * that /field cannot see. Counting them together overstated every number — and
 * with ~70 legacy goals about to share these domains during onboarding, the
 * console would have been unreadable exactly when it matters most. Shown side by
 * side, "18 legacy / 1 field" -> "0 / 18" IS the onboarding progress bar.
 *
 * Queried in a fixed number of grouped round-trips rather than 7 per domain —
 * this is a force-dynamic page and the old loop would have hit ~70 at 10 domains.
 */
export async function loadFieldBackend(): Promise<DomainBackend[]> {
  const configs = await prisma.fieldDomainConfig.findMany({ orderBy: { sortOrder: "asc" } });
  if (!configs.length) return [];
  const domainList = configs.map((c) => c.domain);

  // Goals first: FieldStep/FieldVisit have no needsDomain of their own, so the
  // goal rows are what maps ids -> domain for the grouped counts below.
  const [setupTmpls, visitTmpls, goals] = await Promise.all([
    prisma.setupStepTemplate.findMany({ where: { domain: { in: domainList } }, orderBy: { order: "asc" } }),
    prisma.visitStepTemplate.findMany({ where: { domain: { in: domainList } }, orderBy: { order: "asc" } }),
    prisma.goal.findMany({
      where: { needsDomain: { in: domainList }, deletedAt: null },
      select: { id: true, needsDomain: true, fieldAnchorAt: true },
    }),
  ]);

  const fieldGoalIds: string[] = [];
  const nativeByDomain = new Map<string, number>();
  const legacyByDomain = new Map<string, number>();
  const domainByGoal = new Map<string, string>();
  for (const g of goals) {
    const d = g.needsDomain ?? "";
    domainByGoal.set(g.id, d);
    if (g.fieldAnchorAt) { fieldGoalIds.push(g.id); nativeByDomain.set(d, (nativeByDomain.get(d) ?? 0) + 1); }
    else legacyByDomain.set(d, (legacyByDomain.get(d) ?? 0) + 1);
  }

  const [stepGroups, visitGroups, apGroups] = await Promise.all([
    prisma.fieldStep.groupBy({ by: ["goalId", "kind"], where: { goalId: { in: fieldGoalIds }, deletedAt: null }, _count: { _all: true } }),
    prisma.fieldVisit.groupBy({ by: ["goalId"], where: { goalId: { in: fieldGoalIds } }, _count: { _all: true } }),
    prisma.actionPoint.groupBy({ by: ["goalId"], where: { goalId: { in: fieldGoalIds }, status: "open" }, _count: { _all: true } }),
  ]);

  const tally = (map: Map<string, number>, goalId: string | null, n: number) => {
    const d = goalId ? domainByGoal.get(goalId) : undefined;
    if (d) map.set(d, (map.get(d) ?? 0) + n);
  };
  const setupByDomain = new Map<string, number>();
  const visitRecipeByDomain = new Map<string, number>();
  const visitsByDomain = new Map<string, number>();
  const apByDomain = new Map<string, number>();
  for (const r of stepGroups) tally(r.kind === "Visit" ? visitRecipeByDomain : setupByDomain, r.goalId, r._count._all);
  for (const r of visitGroups) tally(visitsByDomain, r.goalId, r._count._all);
  for (const r of apGroups) tally(apByDomain, r.goalId, r._count._all);

  return configs.map((c) => ({
    config: { domain: c.domain, label: c.label, unit: c.unit, overallSlaDays: c.overallSlaDays, cadenceCount: c.cadenceCount, cadencePeriod: c.cadencePeriod, hasLivePhase: c.hasLivePhase, caregiverForm: c.caregiverForm, isActive: c.isActive },
    setupSteps: setupTmpls.filter((s) => s.domain === c.domain).map((s) => ({ id: s.id, order: s.order, stepKey: s.stepKey, title: s.title, slaDays: s.slaDays, startSlaDays: s.startSlaDays, blockedByKey: s.blockedByKey, phaseTag: s.phaseTag, formKind: s.formKind, formSchema: s.formSchema })),
    visitSteps: visitTmpls.filter((s) => s.domain === c.domain).map((s) => ({ id: s.id, order: s.order, stepKey: s.stepKey, title: s.title, mandatory: s.mandatory, formKind: s.formKind, formSchema: s.formSchema })),
    counts: {
      interventions: nativeByDomain.get(c.domain) ?? 0,
      legacyCandidates: legacyByDomain.get(c.domain) ?? 0,
      setupSteps: setupByDomain.get(c.domain) ?? 0,
      visitRecipe: visitRecipeByDomain.get(c.domain) ?? 0,
      visits: visitsByDomain.get(c.domain) ?? 0,
      openFollowups: apByDomain.get(c.domain) ?? 0,
    },
  }));
}

export type NeedCoverageRow = {
  clusterId: string;
  clusterName: string;
  domain: string;
  domainLabel: string;
  /** Sum of the latest addressable-need count across the cluster's settlements. */
  need: number;
  /** Field-native interventions resolving to this cluster, by membership. */
  interventions: number;
  gap: number;
};

// The addressable columns the SettlementProfile snapshot carries. A
// NeedsFormulaConfig.addressableColumn outside this set has no snapshot to read.
const PROFILE_ADDRESSABLE = ["addressableCreches", "addressableToilets", "addressableWaterATMs"] as const;
type ProfileAddressable = (typeof PROFILE_ADDRESSABLE)[number];

/**
 * Need vs interventions — the Need → Plan link, per cluster and domain.
 *
 * Read-only, and deliberately here rather than on /field/oversight: the need
 * figures belong to the Needs module (NeedsFormulaConfig + the latest
 * assessment snapshot in SettlementProfile) and /field reads them as-is. It
 * reports a gap; it never creates an intervention to close one.
 *
 * Only domains whose formula names an addressable column are covered — today
 * Creche, CommunityToilet and WaterATM. An intervention counts in every cluster
 * it resolves to, the same membership rule as the manager views.
 */
export async function loadNeedCoverage(): Promise<NeedCoverageRow[]> {
  const domains = await activeFieldDomains();
  if (domains.size === 0) return [];
  const formulas = await prisma.needsFormulaConfig.findMany({
    where: { domain: { in: [...domains.keys()] }, addressableColumn: { in: [...PROFILE_ADDRESSABLE] } },
    select: { domain: true, addressableColumn: true },
  });
  if (!formulas.length) return [];
  const columnOf = new Map(formulas.map((f) => [f.domain, f.addressableColumn as ProfileAddressable]));
  const covered = [...columnOf.keys()];

  const [profiles, goals] = await Promise.all([
    prisma.settlementProfile.findMany({
      where: { settlement: { deletedAt: null } },
      select: {
        addressableCreches: true, addressableToilets: true, addressableWaterATMs: true,
        settlement: { select: { cluster: { select: { id: true, name: true, deletedAt: true } } } },
      },
    }),
    prisma.goal.findMany({
      where: { deletedAt: null, fieldAnchorAt: { not: null }, needsDomain: { in: covered } },
      select: {
        needsDomain: true,
        needsCluster: { select: { id: true, name: true } },
        needsSettlement: { select: { cluster: { select: { id: true, name: true } } } },
        linkedFacility: { select: { cluster: { select: { id: true, name: true } } } },
      },
    }),
  ]);

  const rows = new Map<string, NeedCoverageRow>();
  const row = (clusterId: string, clusterName: string, domain: string) => {
    const k = `${clusterId}|${domain}`;
    let r = rows.get(k);
    if (!r) {
      r = { clusterId, clusterName, domain, domainLabel: domains.get(domain)?.label ?? domain, need: 0, interventions: 0, gap: 0 };
      rows.set(k, r);
    }
    return r;
  };

  for (const p of profiles) {
    const c = p.settlement.cluster;
    if (c.deletedAt) continue;
    for (const [domain, col] of columnOf) {
      const n = p[col];
      if (n) row(c.id, c.name, domain).need += n;
    }
  }
  for (const g of goals) {
    const cs = new Map<string, string>();
    for (const c of [g.needsCluster, g.needsSettlement?.cluster, g.linkedFacility?.cluster]) if (c) cs.set(c.id, c.name);
    for (const [id, name] of cs) row(id, name, g.needsDomain!).interventions++;
  }

  return [...rows.values()]
    .map((r) => ({ ...r, gap: Math.max(0, r.need - r.interventions) }))
    .sort((a, b) => b.gap - a.gap || a.clusterName.localeCompare(b.clusterName) || a.domainLabel.localeCompare(b.domainLabel));
}
