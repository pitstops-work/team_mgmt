/**
 * W5 — convert a domain's legacy /operations goals into /field interventions.
 *
 * Projection only: the old Pitstop / ChecklistItem / PitstopEvent rows are left
 * untouched and stay readable by /operations. Generalised from
 * scripts/backfill-field-creche.ts, which proved the mapping on Creche.
 *
 *   Goal            <- fieldAnchorAt (this is what makes it visible to /field),
 *                      overallSlaDays, cadence
 *   FieldStep Setup <- the goal's one-time pitstops WITH real completion state;
 *                      each pitstop's checklist becomes a "checklist" form + answers
 *   FieldStep Visit <- the domain's visit recipe (VisitStepTemplate)
 *   FieldVisit      <- genuinely completed visits (skipping never-arrived cruft)
 *
 * Three things this does that the creche version did not:
 *
 *  1. KEY ALIGNMENT IS REPORTED. A step's key is `pitstop.templateKey ?? slug(title)`.
 *     Any key with no matching SetupStepTemplate produces a FieldStep that the next
 *     resync would soft-delete as "no longer in the template". Rather than drop
 *     those (they are real work someone did), they are imported as AD-HOC —
 *     templateSlug null, which puts them outside resync's delete scope entirely.
 *
 *  2. THE templateSlug MARKER MATCHES RESYNC. The creche version stamped the
 *     SOURCE slug ("creche-program"), which satisfies resync's soft-delete
 *     predicate (templateSlug is truthy) but not its delete scope. Derived rows
 *     now carry the same markers materialize.ts and the resync routes use.
 *
 *  3. IT REFUSES TO CLOBBER REAL USE. The original deleted every FieldVisit for
 *     the goal, commented "pre-launch there are no /field visits yet". That is no
 *     longer true. Backfilled rows are distinguishable from real ones: the
 *     backfill writes completedById null and creates no FieldVisitStep, so either
 *     of those, or a lastUpdatedById, means a person acted through /field.
 *
 * Usage:
 *   npx tsx scripts/backfill-field-domain.ts --domain ElderlyCentre        (dry run)
 *   npx tsx scripts/backfill-field-domain.ts --domain ElderlyCentre --commit
 *   npx tsx scripts/backfill-field-domain.ts --domain X --include-unplaced
 *       Also convert goals with no cluster/settlement/facility. They are
 *       unreachable in /field until given geography, so this is opt-in.
 *   npx tsx scripts/backfill-field-domain.ts --fix-orphans [--commit]
 *       Repairs already-backfilled steps whose key matches no active template,
 *       by making them ad-hoc. Without this a resync soft-deletes them.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import type { Prisma } from "../app/generated/prisma/client";

// Must match materialize.ts and both resync routes, or resync's delete scope misses these rows.
const SETUP_MARKER = "field-setup-template";
const VISIT_MARKER = "field-visit-template";

const flag = (n: string) => process.argv.includes(`--${n}`);
function arg(n: string) {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Steps whose key matches no active template are invisible to resync's update
 *  path but inside its delete path — the worst combination. Make them ad-hoc. */
async function fixOrphans(commit: boolean) {
  const { prisma } = await import("../lib/prisma");
  const templates = await prisma.setupStepTemplate.findMany({ where: { isActive: true }, select: { domain: true, stepKey: true } });
  const byDomain = new Map<string, Set<string>>();
  for (const t of templates) {
    if (!byDomain.has(t.domain)) byDomain.set(t.domain, new Set());
    byDomain.get(t.domain)!.add(t.stepKey);
  }
  let total = 0;
  for (const [domain, keys] of byDomain) {
    const steps = await prisma.fieldStep.findMany({
      where: { kind: "Setup", deletedAt: null, templateSlug: { not: null }, goal: { needsDomain: domain, fieldAnchorAt: { not: null } } },
      select: { id: true, stepKey: true, status: true, goal: { select: { title: true } } },
    });
    const orphans = steps.filter((s) => s.stepKey && !keys.has(s.stepKey));
    for (const o of orphans) {
      console.log(`  ${domain}: "${o.stepKey}" (${o.status}) on "${o.goal.title.slice(0, 40)}" — resync would soft-delete this`);
      if (commit) await prisma.fieldStep.update({ where: { id: o.id }, data: { templateSlug: null } });
    }
    total += orphans.length;
  }
  console.log(`\n${total} orphaned step(s) ${commit ? "made ad-hoc (resync-immune)" : "found"}`);
  if (!commit && total) console.log("re-run with --commit to repair");
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const commit = flag("commit");

  if (flag("fix-orphans")) {
    console.log("=== orphaned backfilled steps ===");
    await fixOrphans(commit);
    return;
  }

  const DOMAIN = arg("domain");
  if (!DOMAIN) throw new Error("--domain is required");

  const domainConfig = await prisma.fieldDomainConfig.findUnique({ where: { domain: DOMAIN } });
  if (!domainConfig) throw new Error(`No FieldDomainConfig for ${DOMAIN} — onboard it first`);

  // ── Guard: skip any goal somebody has actually worked through /field ──────
  // Per goal, not per domain: one test intervention must not block converting
  // the rest. The backfill writes completedById null and creates no
  // FieldVisitStep, so either of those — or a lastUpdatedById, which only the
  // /field routes set — means a person acted here and a rebuild would erase it.
  const domainGoalIds = (await prisma.goal.findMany({ where: { needsDomain: DOMAIN, deletedAt: null }, select: { id: true } })).map((g) => g.id);
  const [tickGoals, doneGoals, touchedGoals] = await Promise.all([
    prisma.fieldVisit.findMany({ where: { goalId: { in: domainGoalIds }, steps: { some: {} } }, select: { goalId: true } }),
    prisma.fieldStep.findMany({ where: { goalId: { in: domainGoalIds }, completedById: { not: null } }, select: { goalId: true } }),
    prisma.fieldStep.findMany({ where: { goalId: { in: domainGoalIds }, lastUpdatedById: { not: null } }, select: { goalId: true } }),
  ]);
  const inUse = new Set([...tickGoals, ...doneGoals, ...touchedGoals].map((r) => r.goalId));
  if (inUse.size && flag("force")) console.log(`--force: rebuilding ${inUse.size} goal(s) that have real /field use\n`);

  const setupTmpls = await prisma.setupStepTemplate.findMany({ where: { domain: DOMAIN, isActive: true }, orderBy: { order: "asc" } });
  const visitTmpls = await prisma.visitStepTemplate.findMany({ where: { domain: DOMAIN, isActive: true }, orderBy: { order: "asc" } });
  const setupByKey = new Map(setupTmpls.map((t) => [t.stepKey, t]));

  const goals = await prisma.goal.findMany({
    where: { needsDomain: DOMAIN, deletedAt: null },
    include: { pitstops: { where: { deletedAt: null }, orderBy: { order: "asc" }, include: { checklistItems: true } }, centreCatalog: true },
    // needsClusterId / needsSettlementId / linkedFacilityId come through by default on the model.
  });

  let setupCount = 0, visitRecipeCount = 0, visitOccCount = 0, matched = 0, unmatched = 0;
  const unmatchedKeys = new Map<string, number>();
  const report: string[] = [];

  let skipped = 0, unplaced = 0;
  const unplacedTitles: string[] = [];
  for (const goal of goals) {
    if (inUse.has(goal.id) && !flag("force")) {
      report.push(`  ${goal.title.slice(0, 44).padEnd(44)} SKIPPED — worked on through /field already`);
      skipped++;
      continue;
    }
    // /field is place-based: every screen groups by cluster, so a goal with no
    // cluster, settlement or facility renders as "—" and is unreachable. The
    // first run of this script swept six programme-level goals in that way
    // (training prep, partner scouting, roadmaps, a monthly review) and they had
    // to be removed again. Absence of geography is not proof a goal is
    // programme-level — "Community Sanitation Complex" is a real place that was
    // simply missing its cluster — so this asks rather than decides.
    const placed = !!(goal.needsClusterId || goal.needsSettlementId || goal.linkedFacilityId);
    if (!placed) {
      unplaced++;
      unplacedTitles.push(goal.title);
      if (!flag("include-unplaced")) {
        report.push(`  ${goal.title.slice(0, 44).padEnd(44)} SKIPPED — no cluster/settlement/facility`);
        skipped++;
        continue;
      }
    }
    const anchor = goal.startDate ?? goal.createdAt;
    const cadenceCount = goal.centreCatalog?.cadenceCount ?? domainConfig.cadenceCount;
    const cadencePeriod = goal.centreCatalog?.cadencePeriod ?? domainConfig.cadencePeriod;

    const setupPitstops = goal.pitstops.filter((p) => (p.recurrence ?? "None") === "None");
    const setupRows: Prisma.FieldStepUncheckedCreateInput[] = setupPitstops.map((p, i) => {
      const stepKey = p.templateKey ?? slug(p.title);
      const tmpl = setupByKey.get(stepKey);
      if (tmpl) matched++;
      else { unmatched++; unmatchedKeys.set(stepKey, (unmatchedKeys.get(stepKey) ?? 0) + 1); }

      const status = p.status === "Done" ? "Done" : p.status === "InProgress" ? "InProgress" : "Todo";
      const items = p.checklistItems.map((c) => ({ key: c.key ?? slug(c.text), text: c.text }));
      const checked: Record<string, boolean> = {};
      for (const c of p.checklistItems) checked[c.key ?? slug(c.text)] = c.checked || c.status === "Done";
      const slaDays = tmpl?.slaDays ?? null;
      return {
        goalId: goal.id,
        kind: "Setup" as const,
        title: p.title,
        order: i,
        // Unmatched = ad-hoc. templateSlug null keeps resync from soft-deleting
        // real work whose key the template set does not know about.
        templateSlug: tmpl ? SETUP_MARKER : null,
        stepKey,
        slaDays,
        startSlaDays: tmpl?.startSlaDays ?? null,
        blockedByKey: tmpl?.blockedByKey ?? null,
        phaseTag: tmpl?.phaseTag ?? null,
        dueDate: p.targetDate ?? (slaDays != null ? addDays(anchor, slaDays) : null),
        formKind: items.length ? "checklist" : (tmpl?.formKind ?? null),
        formSchema: items.length ? { items } : (tmpl?.formSchema ?? undefined),
        status,
        answers: items.length ? { checked } : undefined,
        completedById: null,
        completedAt: p.completedAt,
        startedAt: p.startDate,
      };
    });

    const isLive = goal.mode === "live" || !!goal.centreCatalog;
    const visitRows: Prisma.FieldStepUncheckedCreateInput[] = isLive
      ? visitTmpls.map((t, i) => ({
          goalId: goal.id, kind: "Visit" as const, title: t.title, order: i,
          templateSlug: VISIT_MARKER, stepKey: t.stepKey, mandatory: t.mandatory,
          formKind: t.formKind, formSchema: t.formSchema ?? undefined,
        }))
      : [];

    const completedVisits = await prisma.pitstopEvent.findMany({
      where: { type: "Visit", visitEventId: null, status: "Done", completedAt: { not: null }, checklistItem: { pitstop: { goalId: goal.id } } },
      select: { scheduledAt: true, arrivedAt: true, arrivedById: true, completedAt: true, completedById: true },
    });

    setupCount += setupRows.length;
    visitRecipeCount += visitRows.length;
    visitOccCount += completedVisits.length;
    const adhoc = setupRows.filter((r) => r.templateSlug === null).length;
    report.push(
      `  ${goal.title.slice(0, 44).padEnd(44)} mode=${goal.mode.padEnd(5)} setup=${String(setupRows.length).padStart(2)}${adhoc ? ` (${adhoc} ad-hoc)` : ""} visitRecipe=${String(visitRows.length).padStart(2)} doneVisits=${completedVisits.length}`,
    );

    if (!commit) continue;

    await prisma.$transaction(async (tx) => {
      await tx.goal.update({
        where: { id: goal.id },
        data: { fieldAnchorAt: anchor, overallSlaDays: domainConfig.overallSlaDays, cadenceCount, cadencePeriod },
      });
      // Replace derived rows only; ad-hoc /field additions (templateSlug null) survive.
      await tx.fieldStep.deleteMany({ where: { goalId: goal.id, templateSlug: { in: [SETUP_MARKER, VISIT_MARKER] } } });
      for (const r of [...setupRows, ...visitRows]) await tx.fieldStep.create({ data: r });
      // Safe because the guard above proved nobody has used /field for this domain.
      await tx.fieldVisit.deleteMany({ where: { goalId: goal.id } });
      for (const v of completedVisits) {
        await tx.fieldVisit.create({
          data: {
            goalId: goal.id,
            scheduledFor: v.scheduledAt ?? v.completedAt!,
            arrivedAt: v.arrivedAt, arrivedById: v.arrivedById,
            closedAt: v.completedAt, closedById: v.completedById,
          },
        });
      }
    });
  }

  console.log(`=== ${DOMAIN} backfill ${commit ? "(COMMIT)" : "(DRY RUN)"} ===`);
  console.log(report.join("\n"));
  console.log(`\nTotals: ${goals.length - skipped} goals converted${skipped ? ` · ${skipped} skipped (real /field use)` : ""} · ${setupCount} setup · ${visitRecipeCount} visit-recipe · ${visitOccCount} completed visits`);
  console.log(`Key alignment: ${matched} matched a template, ${unmatched} did not (imported as ad-hoc)`);
  if (unplaced > 0) {
    console.log(
      `\n${unplaced} goal(s) have NO cluster, settlement or facility. /field groups everything by\n` +
      `cluster, so these would render as "—" and be unreachable:`,
    );
    for (const t of unplacedTitles) console.log(`    ${t.slice(0, 70)}`);
    console.log(
      flag("include-unplaced")
        ? "  --include-unplaced given: converting them anyway."
        : "  Skipped. Give them geography first, or pass --include-unplaced if they belong here.",
    );
  }
  if (unmatchedKeys.size) {
    console.log("  unmatched keys:");
    for (const [k, n] of [...unmatchedKeys].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${String(n).padStart(3)}x  ${k}`);
  }
  if (commit) {
    const { logDomainBulkOp } = await import("../lib/field/audit");
    const actor = await prisma.user.findFirst({ where: { role: "super-admin", designation: "Leader" }, select: { id: true } });
    if (actor) logDomainBulkOp(DOMAIN, actor.id, "derive_templates", { backfill: true, goals: goals.length, setup: setupCount, visitRecipe: visitRecipeCount, visits: visitOccCount, adhoc: unmatched });
  } else {
    console.log("\ndry run — re-run with --commit to write");
  }
}

main()
  .catch((e) => {
    console.error("\nERR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
