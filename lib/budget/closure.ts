/**
 * The terminal state.
 *
 * Nothing ever ended. `lib/budget/lapse.ts` reports unspent money as a sizing
 * signal and no grant ever reached a final state, so a grant that finished two
 * years ago is indistinguishable from one running today — which makes every
 * portfolio total wrong in the same direction.
 *
 * Two deliberate choices:
 *
 * 1. **The closing figures are FROZEN into the row**, not read live afterwards.
 *    The cost-provenance lesson: a closed grant's numbers must not move when
 *    the registry or the reports shift underneath them. Anything that recomputes
 *    them later is a bug.
 *
 * 2. **`settlementMode` has no default.** How unspent money is treated is
 *    decided case by case here — sometimes refunded, sometimes adjusted against
 *    a renewal, occasionally written off — so a default would make the system
 *    quietly assert a financial position that nobody took. Where there is a
 *    balance, a person must choose before closure can be signed off, and a
 *    carry-forward must name the budget it went into or the money appears twice
 *    across two grants.
 */

import prisma from "@/lib/prisma";
import { toDecimal, moneyToString, sumMoney, subMoneyFloored, compareMoney } from "./money";
import { isAssetDisposition, DISPOSITIONS_NEEDING_NOTE, type AssetDisposition } from "./closureVocabulary";
import { requireAuthority } from "./authority";
import { activeDecision } from "./decision";
import { logGrant, logGateOverride } from "./audit";

type SessionLike = { user?: { id?: string | null; role?: string | null } | null } | null;

export const SETTLEMENT_MODES = [
  "refunded",
  "adjusted_against_renewal",
  "written_off",
  "none",
] as const;
export type SettlementMode = (typeof SETTLEMENT_MODES)[number];

/** Computed live while the grant is open; frozen at closure. */
export async function closureFigures(budgetId: string) {
  const [disbursements, slots, borrowings] = await Promise.all([
    prisma.disbursement.findMany({
      where: { budgetId, status: "released" },
      select: { amount: true },
    }),
    prisma.budgetReportSlot.findMany({
      where: { budgetId, status: "approved" },
      select: { report: { select: { lines: { select: { actualAmount: true } } } } },
    }),
    prisma.grantBorrowing.findMany({
      where: { OR: [{ fromBudgetId: budgetId }, { toBudgetId: budgetId }] },
      // GrantBorrowing has no settled timestamp — `status` is the state, and
      // `reimbursed` is the only settled one. A partially reimbursed borrowing
      // is still open money and must block closure.
      select: { id: true, amount: true, fromBudgetId: true, status: true },
    }),
  ]);

  const totalReleased = sumMoney(disbursements.map((d) => d.amount));
  const totalUtilised = sumMoney(
    slots.flatMap((s) => s.report?.lines.map((l) => l.actualAmount) ?? []),
  );
  const unspent = subMoneyFloored(totalReleased, totalUtilised);
  const openBorrowings = borrowings.filter((b) => b.status !== "reimbursed");

  return {
    totalReleased,
    totalUtilised,
    unspent,
    openBorrowings: openBorrowings.map((b) => ({
      id: b.id,
      amount: moneyToString(b.amount),
      direction: b.fromBudgetId === budgetId ? ("lent" as const) : ("borrowed" as const),
    })),
  };
}

export type ClosureBlocker = { code: string; message: string };

/**
 * What stands between a grant and being closed.
 *
 * Returns blockers rather than a boolean for the same reason the release gate
 * does: someone has to go and fix these, and a list names them.
 */
export async function closureGate(budgetId: string): Promise<{
  ok: boolean;
  blockers: ClosureBlocker[];
}> {
  const blockers: ClosureBlocker[] = [];

  const [slots, decision, requirements, documents, closure, figures] = await Promise.all([
    prisma.budgetReportSlot.findMany({
      where: { budgetId },
      select: { id: true, slotNumber: true, status: true },
      orderBy: { slotNumber: "asc" },
    }),
    activeDecision(budgetId),
    prisma.grantDocumentRequirement.findMany({
      where: { isActive: true, timing: "pre_closure" },
      select: { kind: true },
    }),
    prisma.grantDocument.findMany({ where: { budgetId }, select: { kind: true } }),
    prisma.grantClosure.findUnique({
      where: { budgetId },
      select: { settlementMode: true, adjustedIntoBudgetId: true, borrowingsSettled: true },
    }),
    closureFigures(budgetId),
  ]);

  for (const s of slots) {
    if (s.status !== "approved") {
      blockers.push({
        code: "report_open",
        message: `Report ${s.slotNumber} is ${s.status.replace(/_/g, " ")}, not approved.`,
      });
    }
  }

  for (const c of decision?.conditions ?? []) {
    if (c.status === "open" && c.timing === "pre_closure") {
      blockers.push({
        code: "condition_open",
        message: `Closure condition still open: ${c.text.slice(0, 160)}`,
      });
    }
  }

  const held = new Set(documents.map((d) => d.kind));
  for (const r of requirements) {
    if (!held.has(r.kind)) {
      blockers.push({
        code: "document_missing",
        message: `Missing closure document: ${r.kind.replace(/_/g, " ")}`,
      });
    }
  }

  if (figures.openBorrowings.length) {
    blockers.push({
      code: "borrowing_open",
      message: `${figures.openBorrowings.length} unsettled borrowing(s) against this grant.`,
    });
  }

  // The settlement decision: required whenever there is a balance, and never
  // inferred. A carry-forward with no target budget is untraceable.
  if (!figures.unspent.isZero()) {
    if (!closure?.settlementMode) {
      blockers.push({
        code: "settlement_undecided",
        message: `${moneyToString(figures.unspent)} unspent — someone has to decide how it is settled before this can close.`,
      });
    } else if (
      closure.settlementMode === "adjusted_against_renewal" &&
      !closure.adjustedIntoBudgetId
    ) {
      blockers.push({
        code: "adjustment_target_missing",
        message: "An adjustment against a renewal has to name the grant it was carried into.",
      });
    }
  }

  return { ok: blockers.length === 0, blockers };
}

/** Begin closing — makes the grant visible as closing and surfaces the gate. */
export async function initiateClosure(session: SessionLike, budgetId: string) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const figures = await closureFigures(budgetId);
  const closure = await prisma.grantClosure.upsert({
    where: { budgetId },
    create: {
      budgetId,
      status: "closing",
      initiatedAt: new Date(),
      totalReleased: figures.totalReleased,
      totalUtilised: figures.totalUtilised,
      unspentAmount: figures.unspent,
    },
    update: {
      status: "closing",
      initiatedAt: new Date(),
      // Refreshed while closing, frozen at close. Still moving at this point:
      // a late report can still be approved.
      totalReleased: figures.totalReleased,
      totalUtilised: figures.totalUtilised,
      unspentAmount: figures.unspent,
    },
    select: { id: true },
  });

  logGrant("GrantClosure", closure.id, userId, "closure_initiated", {
    field: budgetId,
    to: moneyToString(figures.unspent),
  });

  return { closureId: closure.id, gate: await closureGate(budgetId) };
}

/** Record how the unspent balance is being settled. No default, by design. */
export async function setSettlement(
  session: SessionLike,
  budgetId: string,
  input: {
    mode: SettlementMode;
    adjustedIntoBudgetId?: string | null;
    refundAmount?: unknown;
    refundReceivedOn?: Date | null;
    refundReference?: string | null;
    writeOffNote?: string | null;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  if (input.mode === "adjusted_against_renewal" && !input.adjustedIntoBudgetId) {
    throw new Error("Say which grant the balance was carried into.");
  }
  if (input.mode === "written_off" && !input.writeOffNote?.trim()) {
    throw new Error("A write-off needs a reason.");
  }
  if (input.mode === "refunded" && !input.refundReference?.trim()) {
    throw new Error("A refund needs the bank reference it came back on.");
  }
  if (input.adjustedIntoBudgetId === budgetId) {
    throw new Error("A grant cannot carry its balance into itself.");
  }

  const figures = await closureFigures(budgetId);

  // "No balance to settle" against an actual balance is a position nobody
  // took, which is precisely what this file's lack of a default exists to
  // prevent. With money left over it has to be refunded, carried, or written
  // off with a reason — "none" would be a write-off that never said so.
  if (input.mode === "none" && !figures.unspent.isZero()) {
    throw new Error(
      `There is ${moneyToString(figures.unspent)} unspent, so "no balance to settle" is not one of the options. Refund it, carry it into another grant, or write it off with a reason.`,
    );
  }

  if (input.mode === "refunded") {
    if (input.refundAmount === undefined || input.refundAmount === null) {
      throw new Error("Record how much came back.");
    }
    const refund = toDecimal(input.refundAmount as never);
    if (refund.lessThanOrEqualTo(0)) throw new Error("A refund has to be more than zero.");
    // More than the balance is always an error, and the figure goes straight
    // into a closed grant's frozen record where nothing recomputes it.
    if (compareMoney(refund, figures.unspent) > 0) {
      throw new Error(
        `A refund of ${moneyToString(refund)} is more than the ${moneyToString(figures.unspent)} unspent.`,
      );
    }
    if (input.refundReceivedOn && input.refundReceivedOn > new Date()) {
      throw new Error("A refund cannot have been received in the future.");
    }
  }

  if (input.mode === "adjusted_against_renewal" && input.adjustedIntoBudgetId) {
    const target = await prisma.budget.findUnique({
      where: { id: input.adjustedIntoBudgetId },
      select: { id: true, name: true, status: true },
    });
    if (!target) throw new Error("That grant does not exist.");
    // Carrying a balance into a grant that has itself closed puts the money
    // somewhere nothing will ever account for it.
    if (target.status === "closed") {
      throw new Error(`${target.name} is already closed, so a balance cannot be carried into it.`);
    }
  }

  const existing = await prisma.grantClosure.findUnique({
    where: { budgetId },
    select: { id: true, settlementMode: true, status: true },
  });
  if (!existing) throw new Error("Start the closure first.");
  if (existing.status === "closed" || existing.status === "closed_with_exception") {
    throw new Error("This grant is closed — its settlement cannot be changed.");
  }

  await prisma.grantClosure.update({
    where: { budgetId },
    data: {
      settlementMode: input.mode,
      adjustedIntoBudgetId: input.adjustedIntoBudgetId ?? null,
      refundAmount: input.refundAmount === undefined ? undefined : toDecimal(input.refundAmount as never),
      refundReceivedOn: input.refundReceivedOn ?? null,
      refundReference: input.refundReference ?? null,
      writeOffNote: input.writeOffNote ?? null,
    },
  });

  logGrant("GrantClosure", existing.id, userId, "settlement_set", {
    field: input.adjustedIntoBudgetId ?? input.refundReference ?? "settlement",
    from: existing.settlementMode,
    to: input.mode,
  });
}

/**
 * Close the grant.
 *
 * An unmet gate does not silently pass: it produces `closed_with_exception`
 * with a mandatory note, and the exception stays visible on the dashboard. The
 * figures are frozen here and never recomputed.
 */
export async function closeGrant(
  session: SessionLike,
  budgetId: string,
  input: {
    exitDecision?: "renew" | "exit" | "pause";
    exitNote?: string;
    /** Required to close past an unmet gate. */
    exceptionNote?: string;
  } = {},
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: {
      id: true,
      status: true,
      grantingUnitId: true,
      domains: true,
      grantPartner: { select: { orgId: true } },
    },
  });
  if (!budget) throw new Error("Not found");

  const figures = await closureFigures(budgetId);

  await requireAuthority(session, {
    action: "closure_close",
    amount: figures.totalReleased,
    budgetId,
    grantingUnitId: budget.grantingUnitId,
    domain: budget.domains[0] ?? null,
    orgId: budget.grantPartner?.orgId ?? null,
  });

  const gate = await closureGate(budgetId);
  if (!gate.ok && !input.exceptionNote?.trim()) {
    throw new Error(
      `Cannot close yet: ${gate.blockers.map((b) => b.message).join(" / ")}. To close anyway, record an exception note.`,
    );
  }

  const status = gate.ok ? "closed" : "closed_with_exception";
  const now = new Date();

  const closure = await prisma.$transaction(async (tx) => {
    const row = await tx.grantClosure.upsert({
      where: { budgetId },
      create: {
        budgetId,
        status,
        initiatedAt: now,
        closedAt: now,
        totalReleased: figures.totalReleased,
        totalUtilised: figures.totalUtilised,
        unspentAmount: figures.unspent,
        borrowingsSettled: figures.openBorrowings.length === 0,
        exitDecision: input.exitDecision ?? "undecided",
        exitNote: input.exitNote ?? null,
        exceptionNote: gate.ok ? null : input.exceptionNote!.trim(),
        closedById: userId,
      },
      update: {
        status,
        closedAt: now,
        // Frozen at this moment. Nothing reads these live afterwards.
        totalReleased: figures.totalReleased,
        totalUtilised: figures.totalUtilised,
        unspentAmount: figures.unspent,
        borrowingsSettled: figures.openBorrowings.length === 0,
        exitDecision: input.exitDecision ?? undefined,
        exitNote: input.exitNote ?? undefined,
        exceptionNote: gate.ok ? null : input.exceptionNote!.trim(),
        closedById: userId,
      },
      select: { id: true },
    });

    await tx.budget.update({ where: { id: budgetId }, data: { status: "closed" } });
    return row;
  });

  if (!gate.ok) {
    logGateOverride("GrantClosure", closure.id, userId, {
      gate: "closure",
      blockers: gate.blockers.map((b) => `${b.code}: ${b.message}`),
      reason: input.exceptionNote!.trim(),
    });
  }
  logGrant("GrantClosure", closure.id, userId, status, {
    field: `released ${moneyToString(figures.totalReleased)} / utilised ${moneyToString(figures.totalUtilised)}`,
    from: budget.status,
    to: moneyToString(figures.unspent),
  });

  return { closureId: closure.id, status, blockers: gate.blockers };
}

/**
 * Grants that should have closed and have not: the end date has passed, the
 * money has stopped moving, and nobody has wound them up. This is the list
 * that did not exist before, and the reason portfolio totals drifted.
 */
export async function overdueForClosure(opts: { graceDays?: number } = {}) {
  const grace = opts.graceDays ?? 60;
  const cutoff = new Date(Date.now() - grace * 86_400_000);

  const budgets = await prisma.budget.findMany({
    where: {
      status: "approved",
      reportConfig: { grantEndDate: { lt: cutoff } },
      OR: [{ closure: null }, { closure: { status: { in: ["open", "closing"] } } }],
    },
    select: {
      id: true,
      name: true,
      grantPartner: { select: { name: true } },
      reportConfig: { select: { grantEndDate: true } },
      closure: { select: { status: true, initiatedAt: true } },
    },
  });

  return budgets.map((b) => ({
    budgetId: b.id,
    name: b.name,
    partnerName: b.grantPartner?.name ?? null,
    endedOn: b.reportConfig?.grantEndDate ?? null,
    daysOverdue: b.reportConfig?.grantEndDate
      ? Math.floor((Date.now() - b.reportConfig.grantEndDate.getTime()) / 86_400_000)
      : null,
    closureStatus: b.closure?.status ?? "not_started",
  }));
}

// ── Assets bought with grant money ──────────────────────────────────────────
//
// `GrantAsset` existed in the schema and nothing read or wrote it. It matters
// at closure for one reason: the exit decision turns on what was bought and
// where it ended up, and `asset_register` is a pre-closure document
// requirement, so the register has to live somewhere the register can be
// checked against.

export async function addClosureAsset(
  session: SessionLike,
  budgetId: string,
  input: {
    description: string;
    quantity?: number;
    cost: unknown;
    acquiredOn?: Date | null;
    disposition: string;
    dispositionNote?: string | null;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (!input.description?.trim()) throw new Error("Describe the asset.");
  if (!isAssetDisposition(input.disposition)) throw new Error("Pick what happened to it.");
  if (
    DISPOSITIONS_NEEDING_NOTE.includes(input.disposition as AssetDisposition) &&
    !input.dispositionNote?.trim()
  ) {
    throw new Error("That disposition needs a note — on its own it says nothing.");
  }

  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantity has to be at least 1.");

  const cost = toDecimal(input.cost as never);
  if (cost.lessThan(0)) throw new Error("A cost cannot be negative.");
  if (input.acquiredOn && input.acquiredOn > new Date()) {
    throw new Error("An asset cannot have been acquired in the future.");
  }

  const closure = await prisma.grantClosure.findUnique({
    where: { budgetId },
    select: { id: true, status: true },
  });
  if (!closure) throw new Error("Start the closure first — the register hangs off it.");
  if (closure.status === "closed" || closure.status === "closed_with_exception") {
    throw new Error("This grant is closed; its asset register is frozen.");
  }

  const asset = await prisma.grantAsset.create({
    data: {
      closureId: closure.id,
      description: input.description.trim(),
      quantity,
      cost,
      acquiredOn: input.acquiredOn ?? null,
      disposition: input.disposition,
      dispositionNote: input.dispositionNote?.trim() || null,
    },
    select: { id: true },
  });

  logGrant("GrantClosure", closure.id, userId, "asset_recorded", {
    field: input.description.trim(),
    to: `${moneyToString(cost)} · ${input.disposition}`,
  });

  return { assetId: asset.id };
}

export async function removeClosureAsset(session: SessionLike, budgetId: string, assetId: string) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");

  const asset = await prisma.grantAsset.findUnique({
    where: { id: assetId },
    select: {
      id: true,
      description: true,
      cost: true,
      closure: { select: { id: true, budgetId: true, status: true } },
    },
  });
  if (!asset) throw new Error("Not found");
  // The id alone is not authorisation: without this, an asset on another
  // grant's closure could be deleted by anyone who may edit this one.
  if (asset.closure.budgetId !== budgetId) throw new Error("That asset is on another grant.");
  if (asset.closure.status === "closed" || asset.closure.status === "closed_with_exception") {
    throw new Error("This grant is closed; its asset register is frozen.");
  }

  logGrant("GrantClosure", asset.closure.id, userId, "asset_removed", {
    field: asset.description,
    from: moneyToString(asset.cost),
  });
  await prisma.grantAsset.delete({ where: { id: assetId } });
}

/** The register for one grant, with its total. */
export async function closureAssets(budgetId: string) {
  const closure = await prisma.grantClosure.findUnique({
    where: { budgetId },
    select: {
      assets: {
        select: {
          id: true,
          description: true,
          quantity: true,
          cost: true,
          acquiredOn: true,
          disposition: true,
          dispositionNote: true,
        },
        orderBy: { description: "asc" },
      },
    },
  });
  const assets = closure?.assets ?? [];
  return {
    assets: assets.map((a) => ({ ...a, cost: moneyToString(a.cost) })),
    total: moneyToString(sumMoney(assets.map((a) => a.cost))),
    undecided: assets.filter((a) => a.disposition === "undecided").length,
  };
}
