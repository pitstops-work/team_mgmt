/**
 * Derive a domain's /field step templates from the legacy control-plane config.
 *
 * The alternative is hand-authoring: ~8-13 setup steps plus a visit recipe per
 * domain, each needing a title, SLA, start SLA, blocked-by and a form, typed
 * through blur-per-field inputs. Across nine domains that is both a lot of
 * clicking and a lot of chances to diverge from what the programme actually
 * documented.
 *
 * Deriving instead keeps two things true that hand-authoring cannot:
 *
 *   1. stepKey comes from the legacy pitstop/catalog key, so it is meaningful
 *      AND it matches the `templateKey` the instance backfill will carry over —
 *      which is what lets resync recognise a backfilled step as the same step.
 *      (Hand-authored steps get slugs derived from whatever title was typed.)
 *   2. SLAs, the dependency chain and checklist contents come from the live
 *      config rather than from someone retyping them.
 *
 * Generalised from scripts/seed-field-templates-creche.ts, which proved the
 * mapping on Creche. Everything domain-specific there is a parameter here.
 *
 * Build a plan (pure read) -> show it -> apply it. The two halves are separate
 * so the UI and the CLI can both preview before writing.
 */

import prisma from "@/lib/prisma";

export type PlanSetupStep = {
  order: number;
  stepKey: string;
  title: string;
  slaDays: number | null;
  startSlaDays: number | null;
  blockedByKey: string | null;
  phaseTag: string | null;
  formKind: string | null;
  formSchema?: unknown;
  itemCount: number;
};

export type PlanVisitStep = {
  order: number;
  stepKey: string;
  title: string;
  mandatory: boolean;
  formKind: string | null;
  formSchema?: unknown;
  itemCount: number;
};

export type TemplatePlan = {
  domain: string;
  config: {
    overallSlaDays: number | null;
    cadenceCount: number | null;
    cadencePeriod: string | null;
    hasLivePhase: boolean;
  };
  setup: PlanSetupStep[];
  visit: PlanVisitStep[];
  /** Things the operator should look at before applying. Never fatal. */
  warnings: string[];
};

export type DeriveInput = {
  domain: string;
  /** GoalTemplateDef slug holding the one-time setup pitstops. */
  setupSlug: string;
  /** Optional GoalTemplateDef slug for the recurring/"existing" visit rhythm. */
  liveSlug?: string | null;
  /** Optional CatalogTemplateDef slug for visit-catalog items + cadence. */
  catalogSlug?: string | null;
  /**
   * Optional FacilityIndicatorDef key whose checklist items become a SCORED
   * (pass/fail/NA) form on the matching visit step. Only creche_hygiene_score
   * exists today — a domain without one must not invent a scored audit.
   */
  scoredIndicatorKey?: string | null;
};

/** Which visit step the scored indicator checklist attaches to. */
function matchesScoredStep(key: string, title: string, indicatorKey: string): boolean {
  // The creche case is the 24-point audit; keep that heuristic and fall back to
  // a loose match on the indicator's own name for any future domain.
  if (/24-point/i.test(key) || /24-point/i.test(title)) return true;
  const stem = indicatorKey.replace(/_score$/, "").split("_").filter((w) => w.length > 3);
  return stem.length > 0 && stem.every((w) => new RegExp(w, "i").test(`${key} ${title}`));
}

/**
 * Read the legacy config and compose what the templates WOULD be. No writes.
 */
export async function buildTemplatePlan(input: DeriveInput): Promise<TemplatePlan> {
  const { domain, setupSlug, liveSlug, catalogSlug, scoredIndicatorKey } = input;
  const warnings: string[] = [];

  const setupTemplate = await prisma.goalTemplateDef.findUnique({
    where: { slug: setupSlug },
    include: { pitstopDefs: { orderBy: { order: "asc" }, include: { checklist: { orderBy: { order: "asc" } } } } },
  });
  if (!setupTemplate) throw new Error(`Setup template '${setupSlug}' not found`);
  if (setupTemplate.needsDomain && setupTemplate.needsDomain !== domain) {
    warnings.push(`'${setupSlug}' belongs to ${setupTemplate.needsDomain}, not ${domain} — deriving anyway.`);
  }

  // One-time setup work only; a recurring pitstop is visit rhythm, not setup.
  const setupPitstops = setupTemplate.pitstopDefs.filter((p) => (p.recurrence ?? "None") === "None");
  const dropped = setupTemplate.pitstopDefs.length - setupPitstops.length;
  if (dropped > 0) warnings.push(`${dropped} recurring pitstop(s) skipped — those are visit rhythm, not setup.`);
  if (!setupPitstops.length) warnings.push(`'${setupSlug}' has no one-time pitstops; the setup phase would be empty.`);

  let overallSlaDays = 0;
  let prevKey: string | null = null;
  let prevSla = 0;
  const setup: PlanSetupStep[] = setupPitstops.map((p, order) => {
    const sla = p.slaDays ?? null;
    const startSla = p.startSlaDays ?? 0;
    if (sla != null) overallSlaDays = Math.max(overallSlaDays, sla);

    // Sequential chain: a step is blocked by the previous one when it starts at
    // or after the previous step's due date. startSla 0 (and not first) = parallel.
    const blockedByKey = prevKey && startSla > 0 && startSla >= prevSla ? prevKey : null;
    const items = p.checklist.map((c) => ({ key: c.key, text: c.text }));

    prevKey = p.key;
    prevSla = sla ?? prevSla;
    return {
      order,
      stepKey: p.key,
      title: p.title,
      slaDays: sla,
      startSlaDays: startSla,
      blockedByKey,
      phaseTag: p.progressTag ?? null,
      formKind: items.length > 0 ? "checklist" : null,
      formSchema: items.length > 0 ? { items } : undefined,
      itemCount: items.length,
    };
  });

  const untagged = setup.filter((s) => !s.phaseTag).length;
  if (untagged === setup.length && setup.length > 0) {
    warnings.push(`No pitstop in '${setupSlug}' carries a progressTag, so steps will have no phase name.`);
  } else if (untagged > 0) {
    warnings.push(`${untagged} of ${setup.length} setup steps have no phase name.`);
  }

  // ── Visit recipe ──────────────────────────────────────────────────────────
  const [liveTemplate, catalog, indicator] = await Promise.all([
    liveSlug
      ? prisma.goalTemplateDef.findUnique({ where: { slug: liveSlug }, include: { pitstopDefs: { include: { checklist: { orderBy: { order: "asc" } } } } } })
      : Promise.resolve(null),
    catalogSlug
      ? prisma.catalogTemplateDef.findUnique({ where: { slug: catalogSlug }, include: { categoryDefs: { orderBy: { order: "asc" }, include: { items: { orderBy: { order: "asc" } } } } } })
      : Promise.resolve(null),
    scoredIndicatorKey
      ? prisma.facilityIndicatorDef.findFirst({
          where: { key: scoredIndicatorKey },
          select: { checklistItems: { where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { itemKey: true, text: true, category: true, nonNegotiable: true, naAllowed: true } } },
        })
      : Promise.resolve(null),
  ]);
  if (liveSlug && !liveTemplate) warnings.push(`Live template '${liveSlug}' not found — skipped.`);
  if (catalogSlug && !catalog) warnings.push(`Visit catalog '${catalogSlug}' not found — skipped.`);
  if (scoredIndicatorKey && !indicator) warnings.push(`Indicator '${scoredIndicatorKey}' not found — no scored audit attached.`);

  // scored:true makes /field render pass/fail/NA and auto-raise a follow-up on
  // any failed non-negotiable (lib/field/safety.ts).
  const scoredItems = (indicator?.checklistItems ?? []).map((it) => ({
    key: it.itemKey, text: it.text, category: it.category ?? null, nonNegotiable: it.nonNegotiable, naAllowed: it.naAllowed,
  }));

  const visit: PlanVisitStep[] = [];
  const seen = new Set<string>();
  const push = (s: Omit<PlanVisitStep, "order">) => {
    if (seen.has(s.stepKey)) return;
    seen.add(s.stepKey);
    visit.push({ ...s, order: visit.length });
  };

  // What the RP does each visit, from the recurring template's checklists.
  for (const p of liveTemplate?.pitstopDefs ?? []) {
    for (const c of p.checklist) {
      const scored = scoredItems.length > 0 && matchesScoredStep(c.key, c.text, scoredIndicatorKey!);
      push({
        stepKey: c.key, title: c.text, mandatory: true,
        formKind: scored ? "checklist" : null,
        formSchema: scored ? { scored: true, items: scoredItems } : undefined,
        itemCount: scored ? scoredItems.length : 0,
      });
    }
  }
  // Plus the visit catalog's own items.
  for (const cat of catalog?.categoryDefs ?? []) {
    for (const it of cat.items) {
      const isCaregiver = /caregiver/i.test(it.key) || /caregiver/i.test(it.text);
      push({ stepKey: it.key, title: it.text, mandatory: it.blocksSignoff, formKind: isCaregiver ? "caregiver_practices" : null, itemCount: 0 });
    }
  }

  const caregiverSteps = visit.filter((v) => v.formKind === "caregiver_practices").length;
  if (caregiverSteps > 0) {
    const layer = await prisma.facilityLayerConfig.findFirst({ where: { needsDomain: domain, isActive: true }, select: { layerKey: true } });
    if (!layer) {
      warnings.push(`${caregiverSteps} step(s) want the caregiver-practices form, but ${domain} has no facility layer — capture would have nowhere to file. Map a layer first, or clear the form on those steps.`);
    }
  }

  return {
    domain,
    config: {
      overallSlaDays: overallSlaDays || null,
      cadenceCount: catalog?.defaultCadenceCount ?? null,
      cadencePeriod: catalog?.defaultCadencePeriod ?? null,
      hasLivePhase: visit.length > 0,
    },
    setup,
    visit,
    warnings,
  };
}

export type ApplyResult = {
  setupUpserted: number;
  visitUpserted: number;
  setupDeactivated: number;
  visitDeactivated: number;
  setupDeleted: number;
  visitDeleted: number;
  configChanges: { field: string; from: unknown; to: unknown }[];
};

/**
 * Write the plan. Upserts on (domain, stepKey) so re-deriving is safe and
 * preserves anything already materialised against those keys.
 *
 * `prune` handles templates the plan no longer contains. A row is only DELETED
 * when nothing references its key; otherwise it is deactivated, because
 * deleting a template whose steps exist would orphan live work.
 *
 * Domain config is NOT clobbered: cadence and SLA differences are reported as
 * configChanges so the operator decides. A derive should never silently move a
 * live domain from monthly to weekly visits.
 */
export async function applyTemplatePlan(plan: TemplatePlan, opts: { prune?: boolean } = {}): Promise<ApplyResult> {
  const { domain } = plan;
  const res: ApplyResult = {
    setupUpserted: 0, visitUpserted: 0, setupDeactivated: 0, visitDeactivated: 0,
    setupDeleted: 0, visitDeleted: 0, configChanges: [],
  };

  for (const s of plan.setup) {
    await prisma.setupStepTemplate.upsert({
      where: { domain_stepKey: { domain, stepKey: s.stepKey } },
      create: {
        domain, order: s.order, stepKey: s.stepKey, title: s.title, slaDays: s.slaDays,
        startSlaDays: s.startSlaDays, blockedByKey: s.blockedByKey, phaseTag: s.phaseTag,
        formKind: s.formKind, formSchema: (s.formSchema ?? undefined) as never,
      },
      update: {
        order: s.order, title: s.title, slaDays: s.slaDays, startSlaDays: s.startSlaDays,
        blockedByKey: s.blockedByKey, phaseTag: s.phaseTag, formKind: s.formKind,
        formSchema: (s.formSchema ?? undefined) as never, isActive: true,
      },
    });
    res.setupUpserted++;
  }

  for (const v of plan.visit) {
    await prisma.visitStepTemplate.upsert({
      where: { domain_stepKey: { domain, stepKey: v.stepKey } },
      create: { domain, order: v.order, stepKey: v.stepKey, title: v.title, mandatory: v.mandatory, formKind: v.formKind, formSchema: (v.formSchema ?? undefined) as never },
      update: { order: v.order, title: v.title, mandatory: v.mandatory, formKind: v.formKind, formSchema: (v.formSchema ?? undefined) as never, isActive: true },
    });
    res.visitUpserted++;
  }

  if (opts.prune) {
    const planSetup = new Set(plan.setup.map((s) => s.stepKey));
    const planVisit = new Set(plan.visit.map((v) => v.stepKey));
    const [existingSetup, existingVisit] = await Promise.all([
      prisma.setupStepTemplate.findMany({ where: { domain }, select: { id: true, stepKey: true } }),
      prisma.visitStepTemplate.findMany({ where: { domain }, select: { id: true, stepKey: true } }),
    ]);
    const goalIds = (await prisma.goal.findMany({ where: { needsDomain: domain }, select: { id: true } })).map((g) => g.id);

    for (const [rows, inPlan, kind] of [
      [existingSetup, planSetup, "Setup"] as const,
      [existingVisit, planVisit, "Visit"] as const,
    ]) {
      for (const row of rows) {
        if (inPlan.has(row.stepKey)) continue;
        const referenced = await prisma.fieldStep.count({ where: { goalId: { in: goalIds }, kind, stepKey: row.stepKey } });
        const model = kind === "Visit" ? prisma.visitStepTemplate : prisma.setupStepTemplate;
        if (referenced > 0) {
          await (model as { update: (a: unknown) => Promise<unknown> }).update({ where: { id: row.id }, data: { isActive: false } });
          if (kind === "Visit") res.visitDeactivated++; else res.setupDeactivated++;
        } else {
          await (model as { delete: (a: unknown) => Promise<unknown> }).delete({ where: { id: row.id } });
          if (kind === "Visit") res.visitDeleted++; else res.setupDeleted++;
        }
      }
    }
  }

  // Config: report differences rather than overwrite them.
  const cfg = await prisma.fieldDomainConfig.findUnique({ where: { domain } });
  if (cfg) {
    const candidates: [string, unknown, unknown][] = [
      ["overallSlaDays", cfg.overallSlaDays, plan.config.overallSlaDays],
      ["cadenceCount", cfg.cadenceCount, plan.config.cadenceCount],
      ["cadencePeriod", cfg.cadencePeriod, plan.config.cadencePeriod],
      ["hasLivePhase", cfg.hasLivePhase, plan.config.hasLivePhase],
    ];
    for (const [field, from, to] of candidates) {
      if (to === null || to === undefined) continue; // nothing derived to compare
      if (from !== to) res.configChanges.push({ field, from, to });
    }
    // A domain with no SLA at all is safe to fill in — that is not a change of mind.
    if (cfg.overallSlaDays == null && plan.config.overallSlaDays != null) {
      await prisma.fieldDomainConfig.update({ where: { domain }, data: { overallSlaDays: plan.config.overallSlaDays } });
      res.configChanges = res.configChanges.filter((c) => c.field !== "overallSlaDays");
    }
  }

  return res;
}
