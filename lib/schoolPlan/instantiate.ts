import prisma from "@/lib/prisma";
import { SCHOOL_PLAN_STEPS, SERVICE_ITEMS, PROGRAMME_COMPONENTS } from "./stepTemplate";

/** Idempotent: creates any missing step rows from the template. Safe to re-run
 *  after a template edit that only adds new steps. */
export async function ensureSchoolPlanSteps(planId: string): Promise<number> {
  const existing = await prisma.schoolPlanStep.findMany({
    where: { planId },
    select: { stepNo: true },
  });
  const have = new Set(existing.map((r) => r.stepNo));
  const missing = SCHOOL_PLAN_STEPS.filter((s) => !have.has(s.stepNo));
  if (missing.length === 0) return 0;
  await prisma.schoolPlanStep.createMany({
    data: missing.map((s) => ({
      planId,
      stepNo: s.stepNo,
      key: s.key,
      title: s.title,
      description: s.description,
      planSection: s.planSection,
      requiredArtifactType: s.requiredArtifactType,
    })),
    skipDuplicates: true,
  });
  return missing.length;
}

/** Idempotent: seeds the 8 default service checklist rows in `unknown` state. */
export async function ensureSchoolPlanServices(planId: string): Promise<number> {
  const existing = await prisma.schoolPlanService.findMany({
    where: { planId },
    select: { item: true },
  });
  const have = new Set(existing.map((r) => r.item));
  const missing = SERVICE_ITEMS.filter((s) => !have.has(s.key));
  if (missing.length === 0) return 0;
  await prisma.schoolPlanService.createMany({
    data: missing.map((s) => ({ planId, item: s.key })),
    skipDuplicates: true,
  });
  return missing.length;
}

/** Idempotent: seeds the 8 programme-component rows with the ownership-matrix
 *  defaults. Users override `deliveredBy` per plan. */
export async function ensureSchoolPlanComponents(planId: string): Promise<number> {
  const existing = await prisma.schoolPlanComponent.findMany({
    where: { planId },
    select: { component: true },
  });
  const have = new Set(existing.map((r) => r.component));
  const missing = PROGRAMME_COMPONENTS.filter((c) => !have.has(c.key));
  if (missing.length === 0) return 0;
  await prisma.schoolPlanComponent.createMany({
    data: missing.map((c, idx) => ({
      planId,
      component: c.key,
      deliveredBy: c.defaultDelivery,
      sortOrder: idx,
    })),
    skipDuplicates: true,
  });
  return missing.length;
}

/** Run all three ensurers in sequence. Called from School.create action + seed
 *  script. Returns totals for logging. */
export async function bootstrapSchoolPlan(planId: string): Promise<{
  stepsAdded: number;
  servicesAdded: number;
  componentsAdded: number;
}> {
  const stepsAdded = await ensureSchoolPlanSteps(planId);
  const servicesAdded = await ensureSchoolPlanServices(planId);
  const componentsAdded = await ensureSchoolPlanComponents(planId);
  return { stepsAdded, servicesAdded, componentsAdded };
}
