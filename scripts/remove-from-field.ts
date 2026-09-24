/**
 * Take a goal back out of /field.
 *
 * /field is a PLACE-BASED tool — cluster → intervention → steps an RP visits.
 * The domain backfill converted every goal carrying an onboarded needsDomain
 * regardless of shape, so it swept in programme-level work that has no place:
 * training-module preparation, partner scouting, entitlement roadmaps, monthly
 * operations reviews, "non-visit work". Those render as "—" and are unreachable,
 * because every screen groups by cluster.
 *
 * The fix for "this does not fit the model" is not to widen the model. No
 * unplaced bucket, and no assigning a plausible cluster — that would
 * misrepresent city-wide work as belonging to one cluster and corrupt the
 * manager rollups that group by it.
 *
 * What this does, per goal:
 *   - clears Goal.fieldAnchorAt, which is THE discriminator for "field-native"
 *     (lib/field/queries.ts and lib/field/rollup.ts both filter on it), so the
 *     goal leaves every /field screen and every rollup at once
 *   - soft-deletes its FieldStep rows, matching how resync retires steps
 *   - deletes the FieldVisit rows the backfill projected from /operations
 *
 * The old spine is never touched: the goal keeps its pitstops, checklists and
 * activities, and carries on working in /operations. Fully reversible — re-run
 * scripts/backfill-field-domain.ts for its domain to bring it back.
 *
 *   npx tsx scripts/remove-from-field.ts --goal <id> [--goal <id> ...]
 *   npx tsx scripts/remove-from-field.ts --goal <id> --commit
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

function goalIds(): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === "--goal" && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { logField } = await import("../lib/field/audit");
  const commit = process.argv.includes("--commit");
  const ids = goalIds();
  if (!ids.length) throw new Error("pass at least one --goal <id>");

  const actor = await prisma.user.findFirst({ where: { role: "super-admin", designation: "Leader" }, select: { id: true } });
  if (!actor) throw new Error("no super-admin to attribute the change to");

  for (const id of ids) {
    const g = await prisma.goal.findUnique({
      where: { id },
      select: {
        id: true, title: true, needsDomain: true, fieldAnchorAt: true,
        needsClusterId: true, needsSettlementId: true, linkedFacilityId: true,
        fieldSteps: { where: { deletedAt: null }, select: { id: true, completedById: true, lastUpdatedById: true } },
        fieldVisits: { select: { id: true, steps: { select: { id: true } } } },
        pitstops: { where: { deletedAt: null }, select: { id: true } },
      },
    });
    if (!g) { console.log(`${id}: not found`); continue; }
    if (!g.fieldAnchorAt) { console.log(`${g.title.slice(0, 50)}: already out of /field`); continue; }

    // Refuse anything a person has actually worked through /field. Backfilled
    // rows carry no completedById and spawn no FieldVisitStep, so either means
    // real use — same predicate scripts/backfill-field-domain.ts uses.
    const touched = g.fieldSteps.filter((s) => s.completedById || s.lastUpdatedById).length;
    const ticks = g.fieldVisits.reduce((n, v) => n + v.steps.length, 0);
    if (touched || ticks) {
      console.log(`REFUSING "${g.title.slice(0, 50)}" — ${touched} step(s) worked, ${ticks} visit tick(s). Removing would destroy real work.`);
      continue;
    }

    const placed = !!(g.needsClusterId || g.needsSettlementId || g.linkedFacilityId);
    console.log(
      `${commit ? "REMOVING" : "would remove"} [${g.needsDomain}] ${g.title.slice(0, 54)}\n` +
      `   ${g.fieldSteps.length} step(s) soft-deleted · ${g.fieldVisits.length} backfilled visit(s) deleted · ` +
      `${g.pitstops.length} legacy pitstop(s) stay on /operations${placed ? "  ⚠ THIS GOAL HAS GEOGRAPHY — is it really programme-level?" : ""}`,
    );

    if (!commit) continue;
    await prisma.$transaction(async (tx) => {
      await tx.fieldStep.updateMany({ where: { goalId: g.id, deletedAt: null }, data: { deletedAt: new Date() } });
      await tx.fieldVisit.deleteMany({ where: { goalId: g.id } });
      await tx.goal.update({ where: { id: g.id }, data: { fieldAnchorAt: null } });
    });
    logField("FieldIntervention", g.id, actor.id, "removed_from_field", {
      field: g.needsDomain ?? "",
      from: g.title,
      to: "not place-based — stays on /operations",
    });
  }

  if (!commit) console.log("\ndry run — add --commit to write");

  // auditLog is fire-and-forget by design (it must never block a request), but
  // this is a CLI that calls process.exit in its finally — which kills the last
  // write mid-flight. Cost one audit row the first time this ran. Let them land.
  await new Promise((r) => setTimeout(r, 1500));
}

main()
  .catch((e) => {
    console.error("\nERR:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
