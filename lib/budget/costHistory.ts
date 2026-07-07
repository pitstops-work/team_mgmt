// Append-only cost-registry change log. Both the admin server actions and the
// V.2 reseed script write through here so every unit-cost change lands one row
// in CostRegistryHistory — the reflective "what changed, when, why" trail.
//
// Reproduction of old budgets is NOT this table's job (Budget.costSnapshot
// already freezes the basis at create time); this is purely provenance.

import { Prisma, PrismaClient } from "@/app/generated/prisma/client";

/** Accepts the base client or a $transaction client so callers can log inside
 *  the same transaction that mutates the registry. */
type Db = PrismaClient | Prisma.TransactionClient;

export type CostChange = {
  city: string;
  domain?: string | null;
  itemKey: string;
  oldCost: number | null; // null → item created
  newCost: number | null; // null → item deleted
  source?: string | null; // "Urban Creche V.2 May25" | "admin edit" | "seed" | "reset"
  reason?: string | null;
  changedById?: string | null;
};

/** Log one change. No-op when the cost is unchanged, so metadata-only edits
 *  (notes / displayGroup) don't create noise. */
export async function logCostChange(db: Db, c: CostChange): Promise<void> {
  if (c.oldCost === c.newCost) return;
  await db.costRegistryHistory.create({
    data: {
      city: c.city,
      domain: c.domain ?? null,
      itemKey: c.itemKey,
      oldCost: c.oldCost,
      newCost: c.newCost,
      source: c.source ?? null,
      reason: c.reason ?? null,
      changedById: c.changedById ?? null,
    },
  });
}
