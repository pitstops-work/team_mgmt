/**
 * Step-template key identity.
 *
 * stepKey is the RESYNC IDENTITY: resync matches materialised FieldSteps to
 * templates on (domain, stepKey). Everything here exists to keep that join
 * intact while still letting an operator fix a bad key.
 *
 * Lives in lib/ rather than in the route so the cascade can be exercised and
 * verified directly, not only through HTTP.
 */

import prisma from "@/lib/prisma";
import { logField } from "@/lib/field/audit";

export const slugStepKey = (t: string) =>
  t.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/**
 * Rename a step template's stepKey, carrying every reference with it.
 *
 * stepKey is the RESYNC IDENTITY: resync matches materialised FieldSteps to
 * templates on (domain, stepKey). So a bare rename would make resync treat the
 * old key as deleted and the new one as new — soft-deleting the live step and
 * creating a fresh Todo in its place, silently discarding completion, answers
 * and who completed it.
 *
 * Hence this is an EXPLICIT operation with a cascade, and NOT something that
 * fires implicitly when a title is edited. The cascade covers:
 *   1. the template row itself
 *   2. sibling templates pointing at it via blockedByKey (setup only — visit
 *      templates have no dependency pointer)
 *   3. every materialised FieldStep carrying the old key, across the domain
 *   4. those same FieldSteps' own blockedByKey pointers
 *
 * All in one transaction: a half-applied rename is exactly the corruption the
 * whole operation exists to avoid.
 */
export async function renameStepKey(opts: { id: string; kind: "setup" | "visit"; next: string; actorId: string }) {
  const { id, kind, next, actorId } = opts;
  const model = (kind === "visit" ? prisma.visitStepTemplate : prisma.setupStepTemplate) as any;

  const row = await model.findUnique({ where: { id }, select: { id: true, domain: true, stepKey: true } });
  if (!row) return { error: "Not found", status: 404 as const };
  if (next === row.stepKey) return { ok: true, stepKey: next, steps: 0 };

  const clash = await model.findFirst({ where: { domain: row.domain, stepKey: next }, select: { id: true } });
  if (clash) return { error: `"${next}" is already used by another ${kind} step in ${row.domain}`, status: 409 as const };

  // Scope the FieldStep cascade by goal. updateMany can't filter on a relation,
  // so resolve the domain's goals first — a domain holds tens, not thousands.
  const goals = await prisma.goal.findMany({ where: { needsDomain: row.domain }, select: { id: true } });
  const goalIds = goals.map((g) => g.id);
  const stepKind = kind === "visit" ? "Visit" : "Setup";

  const steps = await prisma.$transaction(async (tx) => {
    const txModel = (kind === "visit" ? tx.visitStepTemplate : tx.setupStepTemplate) as any;
    await txModel.update({ where: { id }, data: { stepKey: next } });
    // Only setup templates carry a dependency pointer.
    if (kind === "setup") {
      await tx.setupStepTemplate.updateMany({ where: { domain: row.domain, blockedByKey: row.stepKey }, data: { blockedByKey: next } });
    }
    const moved = await tx.fieldStep.updateMany({ where: { goalId: { in: goalIds }, kind: stepKind, stepKey: row.stepKey }, data: { stepKey: next } });
    await tx.fieldStep.updateMany({ where: { goalId: { in: goalIds }, kind: stepKind, blockedByKey: row.stepKey }, data: { blockedByKey: next } });
    return moved.count;
  });

  logField("FieldTemplate", id, actorId, `${kind}_step_renamed`, { field: row.domain, from: row.stepKey, to: next });
  return { ok: true, stepKey: next, steps };
}
