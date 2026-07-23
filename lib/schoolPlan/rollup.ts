// Materialised rollup: SchoolPlanStep.status is derived from its substeps when
// any exist. Mirrors lib/seeding/rollup.ts. When a step has zero substeps we
// leave step.status alone (self-owned mode).

import type { SchoolPlanStepStatusValue } from "./types";
import type { Prisma, PrismaClient } from "@/app/generated/prisma/client";

type SubStatus = { status: SchoolPlanStepStatusValue };

export function rollupStatus(subs: SubStatus[]): SchoolPlanStepStatusValue {
  if (subs.length === 0) return "pending";
  if (subs.some(s => s.status === "blocked")) return "blocked";
  if (subs.every(s => s.status === "done" || s.status === "not_applicable")) return "done";
  if (subs.some(s => s.status === "in_progress" || s.status === "done")) return "in_progress";
  return "pending";
}

type Tx = PrismaClient | Prisma.TransactionClient;

/** Recompute parent step status from its substeps and write back. No-op when
 *  the step has zero substeps (leaves manually-owned step untouched). */
export async function rollupStep(tx: Tx, stepId: string, actorId: string | null): Promise<void> {
  const subs = await tx.schoolPlanSubstep.findMany({
    where: { stepId },
    select: { status: true },
  });
  if (subs.length === 0) return;
  const newStatus = rollupStatus(subs as SubStatus[]);
  const patch: Prisma.SchoolPlanStepUpdateInput =
    newStatus === "done"
      ? { status: newStatus, completedAt: new Date(), completedById: actorId ?? null }
      : { status: newStatus, completedAt: null, completedById: null };
  await tx.schoolPlanStep.update({ where: { id: stepId }, data: patch });
}
