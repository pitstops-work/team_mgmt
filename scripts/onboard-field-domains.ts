/**
 * W4 — onboard the remaining domains onto the /field spine.
 *
 * Creates the FieldDomainConfig where missing, then derives its step templates
 * from the legacy control-plane config via lib/field/derive.ts (the same code
 * path as the console's "Derive from legacy template" button).
 *
 * Dry run by default. --commit to write, --only <Domain> for one at a time.
 *
 * The template pairings below are NOT guessable and were each checked against
 * the live config:
 *
 *  - Everywhere except WelfareRights, `X` is the one-time setup template and
 *    `X-existing` is the recurring rhythm. WelfareRights INVERTS this: its
 *    `welfare-rights` slug is titled "(existing)" and is 6/8 Monthly, while
 *    `welfare-rights-copy` is titled "(new)" and is entirely one-time. Taking
 *    the obvious slug would have given the biggest domain (30 goals, 23 of them
 *    still in setup) a two-step setup phase.
 *  - FoodDistribution has five competing templates; its one real setup goal was
 *    built from `vendor-new-setup-ops`, so that is the honest choice rather than
 *    whichever template is largest.
 *  - WelfareRights also takes its visit recipe from the CATALOG ONLY. Its
 *    recurring template's checklists are oversight prose ("Confirm partner
 *    team's current map of all active MAS groups") rather than a visit
 *    tick-list, and pulling them in produced 73 weekly steps against the
 *    catalog's curated 15. Measured: the recurring template adds 58 steps to
 *    WelfareRights and exactly 0 to ChildrenCentre, ElderlyCentre and
 *    YouthResourceCentre, so this is one domain's data shape, not a rule.
 *  - ElderlyOutreach has no template of its own, but its single goal's eight
 *    pitstop titles match `elderly-centre-copy` exactly, 8/8 — it was built from
 *    that ElderlyCentre template. Deriving across the domain boundary beats
 *    hand-authoring; the engine warns about the mismatch, which is correct.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

type Target = {
  domain: string;
  scoredIndicatorKey?: string;
  unit: "settlement" | "cluster";
  setupSlug: string;
  liveSlug?: string;
  catalogSlug?: string;
  prune?: boolean;
  note?: string;
};

const TARGETS: Target[] = [
  // Creche was seeded before phaseTag existed. Re-deriving is proven zero-diff
  // against its hand-verified recipe and is how its steps gain phase names.
  // The scored indicator MUST be passed or the 24-point audit loses its form.
  { domain: "Creche", unit: "settlement", setupSlug: "creche-program", liveSlug: "creche-program-existing", catalogSlug: "creche-visit-catalog", scoredIndicatorKey: "creche_hygiene_score", note: "re-derive for phase names only — recipe is unchanged" },
  { domain: "WelfareRights", unit: "settlement", setupSlug: "welfare-rights-copy", catalogSlug: "welfare-rights-visit-catalog", note: "slug inversion + catalog-only visit recipe — see header" },
  { domain: "ChildrenCentre", unit: "cluster", setupSlug: "children-learning-centre", liveSlug: "children-learning-centre-existing", catalogSlug: "children-centre-visit-catalog", prune: true, note: "prunes the abandoned hand-authored steps" },
  { domain: "ElderlyCentre", unit: "cluster", setupSlug: "elderly-centre", liveSlug: "elderly-centre-existing", catalogSlug: "elderly-centre-visit-catalog", note: "NOT elderly-centre-copy (8 steps, different programme)" },
  { domain: "YouthResourceCentre", unit: "cluster", setupSlug: "youth-resource-centre", liveSlug: "youth-resource-centre-existing", catalogSlug: "youth-resource-centre-visit-catalog" },
  { domain: "CommunityToilet", unit: "settlement", setupSlug: "community-toilet", liveSlug: "community-toilet-existing", note: "no progressTags — steps get no phase name" },
  { domain: "WaterATM", unit: "settlement", setupSlug: "water-atm", liveSlug: "water-atm-existing" },
  { domain: "ElderlyKitchen", unit: "settlement", setupSlug: "elderly-kitchen", liveSlug: "elderly-kitchen-existing" },
  { domain: "FoodDistribution", unit: "cluster", setupSlug: "vendor-new-setup-ops", liveSlug: "food-distribution-monthly", note: "assessed at city level; cluster is the closest grain /field models" },
  { domain: "ElderlyOutreach", unit: "settlement", setupSlug: "elderly-centre-copy", note: "cross-domain — its goal was built from this ElderlyCentre template" },
];

const flag = (n: string) => process.argv.includes(`--${n}`);
function arg(n: string) {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { buildTemplatePlan, applyTemplatePlan } = await import("../lib/field/derive");
  const { logField, logDomainBulkOp } = await import("../lib/field/audit");

  const commit = flag("commit");
  const only = arg("only");
  const targets = only ? TARGETS.filter((t) => t.domain === only) : TARGETS;
  if (!targets.length) throw new Error(`No target matches --only ${only}`);

  // Script-driven onboarding still belongs in the logbook, so attribute it.
  const actor = await prisma.user.findFirst({ where: { role: "super-admin", designation: "Leader" }, select: { id: true, name: true } });
  if (!actor) throw new Error("No super-admin found to attribute the change to");

  const summary: Record<string, unknown>[] = [];

  for (const t of targets) {
    const existing = await prisma.fieldDomainConfig.findUnique({ where: { domain: t.domain } });
    const needs = await prisma.needsFormulaConfig.findUnique({ where: { domain: t.domain }, select: { label: true, assessmentLevel: true } });

    const plan = await buildTemplatePlan({
      domain: t.domain,
      setupSlug: t.setupSlug,
      liveSlug: t.liveSlug ?? null,
      catalogSlug: t.catalogSlug ?? null,
      scoredIndicatorKey: t.scoredIndicatorKey ?? null,
    });

    console.log(`\n=== ${t.domain} ${existing ? "(config exists)" : "(new config)"} ===`);
    if (t.note) console.log(`  note: ${t.note}`);
    console.log(`  setup ${plan.setup.length} steps (${plan.setup.filter((s) => s.phaseTag).length} phase-tagged), overall SLA ${plan.config.overallSlaDays ?? "—"}d`);
    console.log(`  visit ${plan.visit.length} steps, cadence ${plan.config.cadenceCount ?? "—"}/${plan.config.cadencePeriod ?? "—"}`);
    for (const w of plan.warnings) console.log(`  ! ${w}`);

    if (commit) {
      if (!existing) {
        const max = await prisma.fieldDomainConfig.aggregate({ _max: { sortOrder: true } });
        await prisma.fieldDomainConfig.create({
          data: {
            domain: t.domain,
            label: needs?.label ?? t.domain,
            unit: t.unit,
            overallSlaDays: plan.config.overallSlaDays,
            cadenceCount: plan.config.cadenceCount,
            cadencePeriod: plan.config.cadencePeriod,
            // A domain with no derived visit recipe has no live phase to run.
            hasLivePhase: plan.visit.length > 0,
            sortOrder: (max._max.sortOrder ?? 0) + 10,
            isActive: true,
          },
        });
        logField("FieldDomain", t.domain, actor.id, "created", { field: "label", to: needs?.label ?? t.domain });
        console.log(`  + config created (unit=${t.unit}, live=${plan.visit.length > 0})`);
      }

      const res = await applyTemplatePlan(plan, { prune: !!t.prune });
      logDomainBulkOp(t.domain, actor.id, "derive_templates", {
        setupSlug: t.setupSlug, liveSlug: t.liveSlug ?? null, catalogSlug: t.catalogSlug ?? null,
        setup: res.setupUpserted, visit: res.visitUpserted,
        deactivated: res.setupDeactivated + res.visitDeactivated, deleted: res.setupDeleted + res.visitDeleted,
      });
      console.log(
        `  applied: ${res.setupUpserted} setup, ${res.visitUpserted} visit` +
          (res.setupDeactivated + res.visitDeactivated ? `, ${res.setupDeactivated + res.visitDeactivated} deactivated` : "") +
          (res.setupDeleted + res.visitDeleted ? `, ${res.setupDeleted + res.visitDeleted} deleted` : ""),
      );
      for (const c of res.configChanges) console.log(`  ~ config ${c.field}: currently ${JSON.stringify(c.from)}, derived ${JSON.stringify(c.to)} — left alone`);
    }

    summary.push({
      domain: t.domain, unit: t.unit, setup: plan.setup.length,
      tagged: plan.setup.filter((s) => s.phaseTag).length, visit: plan.visit.length,
      sla: plan.config.overallSlaDays, cadence: plan.config.cadenceCount ? `${plan.config.cadenceCount}/${plan.config.cadencePeriod}` : "—",
      warnings: plan.warnings.length,
    });
  }

  console.log("");
  console.table(summary);
  if (!commit) console.log("dry run — re-run with --commit to write");
}

main()
  .catch((e) => {
    console.error("\nERR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
