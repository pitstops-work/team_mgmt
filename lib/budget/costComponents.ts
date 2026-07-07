// Structural provenance for aggregate CostRegistry items. An aggregate (e.g. a
// one-time setup bundle) stores a single unitCost, but its derivation is a SUM
// of sub-items held in CostRegistryComponent. This module loads that breakup,
// rolls it up, and validates the roll-up against the parent — so the Working /
// detail sheets can expand any aggregate and the number always reconciles.
//
// Generic across all domains: nothing here is creche-specific.

import { Prisma, PrismaClient } from "@/app/generated/prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export type ComponentRow = {
  label: string;
  spec: string | null;
  qty: number;
  unitCost: number;
  amount: number; // qty × unitCost
};

/** Σ(qty × unitCost), rounded to the rupee. */
export function rollup(rows: Array<{ qty: number; unitCost: number }>): number {
  return Math.round(rows.reduce((s, r) => s + r.qty * r.unitCost, 0));
}

/** Load an aggregate's components (ordered), with amount pre-computed. */
export async function loadComponents(
  db: Db,
  city: string,
  parentItemKey: string,
): Promise<ComponentRow[]> {
  const rows = await db.costRegistryComponent.findMany({
    where: { city, parentItemKey },
    orderBy: { position: "asc" },
  });
  return rows.map(r => ({
    label: r.label,
    spec: r.spec,
    qty: r.qty,
    unitCost: r.unitCost,
    amount: Math.round(r.qty * r.unitCost),
  }));
}

/** Does the component sum match the parent's stored unitCost? */
export function validateRollup(
  parentUnitCost: number,
  rows: Array<{ qty: number; unitCost: number }>,
): { ok: boolean; sum: number; diff: number } {
  const sum = rollup(rows);
  const target = Math.round(parentUnitCost);
  return { ok: sum === target, sum, diff: sum - target };
}
