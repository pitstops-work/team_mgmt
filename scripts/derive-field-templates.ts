/**
 * Derive a domain's /field step templates from the legacy control-plane config.
 *
 * Generalises scripts/seed-field-templates-creche.ts, which proved the mapping
 * on Creche and stays in place as the provenance record for that domain.
 *
 * Dry run by default — prints the plan and writes nothing. Add --commit to apply.
 *
 *   npx tsx scripts/derive-field-templates.ts --domain ElderlyCentre \
 *     --setup-slug elderly-centre --live-slug elderly-centre-existing \
 *     --catalog-slug elderly-centre-visit-catalog
 *
 *   ... --commit            write it
 *   ... --prune             also retire templates the plan no longer contains
 *                           (deactivates rather than deletes when live steps
 *                            reference the key)
 *   ... --scored-indicator creche_hygiene_score
 *                           attach a pass/fail/NA audit to the matching visit step
 *   ... --list              show the derivable templates for the domain and exit
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { buildTemplatePlan, applyTemplatePlan } = await import("../lib/field/derive");

  const domain = arg("domain");
  if (!domain) throw new Error("--domain is required");

  if (flag("list")) {
    const [templates, catalogs] = await Promise.all([
      prisma.goalTemplateDef.findMany({
        where: { needsDomain: domain, isActive: true },
        select: { slug: true, name: true, _count: { select: { pitstopDefs: true } } },
        orderBy: { slug: "asc" },
      }),
      prisma.catalogTemplateDef.findMany({ where: { needsDomain: domain, isActive: true }, select: { slug: true, defaultCadenceCount: true, defaultCadencePeriod: true } }),
    ]);
    console.log(`\nGoalTemplateDefs for ${domain}:`);
    for (const t of templates) console.log(`  ${t.slug.padEnd(40)} ${String(t._count.pitstopDefs).padStart(2)} pitstops   ${t.name}`);
    console.log(`\nCatalogTemplateDefs for ${domain}:`);
    for (const c of catalogs) console.log(`  ${c.slug.padEnd(40)} cadence ${c.defaultCadenceCount ?? "-"}/${c.defaultCadencePeriod ?? "-"}`);
    if (!templates.length) console.log("  (none — this domain must be hand-authored)");
    return;
  }

  const setupSlug = arg("setup-slug");
  if (!setupSlug) throw new Error("--setup-slug is required (use --list to see the options)");

  const plan = await buildTemplatePlan({
    domain,
    setupSlug,
    liveSlug: arg("live-slug") ?? null,
    catalogSlug: arg("catalog-slug") ?? null,
    scoredIndicatorKey: arg("scored-indicator") ?? null,
  });

  console.log(`\n=== ${domain} — derived from ${setupSlug} ===`);
  console.log(`\nSETUP (${plan.setup.length} steps, overall SLA ${plan.config.overallSlaDays ?? "-"}d)`);
  for (const s of plan.setup) {
    console.log(
      `  [${String(s.order).padStart(2)}] ${s.stepKey.padEnd(42)} sla=${String(s.slaDays ?? "-").padStart(3)} start=${String(s.startSlaDays ?? "-").padStart(3)}` +
        ` blockedBy=${(s.blockedByKey ?? "-").padEnd(42)} phase=${(s.phaseTag ?? "-").padEnd(15)} ${s.itemCount ? `${s.itemCount} items` : ""}`,
    );
  }
  console.log(`\nVISIT (${plan.visit.length} steps, cadence ${plan.config.cadenceCount ?? "-"}/${plan.config.cadencePeriod ?? "-"})`);
  for (const v of plan.visit) {
    console.log(`  [${String(v.order).padStart(2)}] ${v.stepKey.padEnd(52)} mandatory=${v.mandatory} form=${v.formKind ?? "-"}${v.itemCount ? ` (${v.itemCount} items)` : ""}`);
  }
  if (plan.warnings.length) {
    console.log("\nWARNINGS");
    for (const w of plan.warnings) console.log(`  ! ${w}`);
  }

  if (!flag("commit")) {
    console.log("\ndry run — re-run with --commit to write");
    return;
  }

  const res = await applyTemplatePlan(plan, { prune: flag("prune") });
  console.log(
    `\nAPPLIED  setup: ${res.setupUpserted} upserted` +
      (res.setupDeactivated || res.setupDeleted ? ` / ${res.setupDeactivated} deactivated / ${res.setupDeleted} deleted` : "") +
      `   visit: ${res.visitUpserted} upserted` +
      (res.visitDeactivated || res.visitDeleted ? ` / ${res.visitDeactivated} deactivated / ${res.visitDeleted} deleted` : ""),
  );
  if (res.configChanges.length) {
    console.log("\nDOMAIN CONFIG differs from what the legacy config implies — NOT changed automatically:");
    for (const c of res.configChanges) console.log(`  ${c.field}: currently ${JSON.stringify(c.from)}, derived ${JSON.stringify(c.to)}`);
    console.log("  Set it deliberately in /field/backend if the derived value is right.");
  }
}

main()
  .catch((e) => {
    console.error("\nERR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
