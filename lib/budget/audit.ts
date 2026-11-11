/**
 * The grant logbook.
 *
 * Before this file, `auditLog()` was called from ~56 places in the app and NONE
 * of them were in `app/(budget)`, `app/api/approvals`, `app/api/budget`,
 * `lib/budget`, `lib/approvals` or `lib/review`. The modules that decide and
 * move money were the only ones with no record of who did what. A grant could
 * be approved, its lines edited, a report signed off and a reallocation granted
 * without leaving a single row behind.
 *
 * That gap is not recoverable after the fact — an unaudited window stays
 * unaudited forever — which is why this ships before the lifecycle models it
 * will record (spec D5).
 *
 * The rules, mirroring `lib/field/audit.ts`:
 *
 *   - The row records the happy path where it can (`approvedAt`, `submittedAt`,
 *     `resolvedById`), so this logbook exists for what a column cannot hold:
 *     WHO decided, WHAT the value was before, and WHY an override was allowed.
 *   - Money writes are low-volume and high-consequence, so unlike /field this
 *     logs the ordinary path too. A budget approval is never noise.
 *   - Bulk operations write ONE row carrying counts, never one row per line. A
 *     regenerate over a 400-line budget is a single operator decision.
 *   - Amounts are logged as plain decimal strings, never formatted with ₹ or
 *     thousands separators: these columns get compared and grepped, and a
 *     locale-formatted number is not comparable.
 *
 * Every writer is fire-and-forget: `auditLog` never throws and never blocks the
 * response. Rows surface in /settings/audit with no extra UI.
 */

import { auditLog, auditLogMany, type AuditEntityType, type AuditEntry } from "@/lib/auditLog";

/**
 * Compact a value for the oldValue/newValue text columns.
 *
 * Money arrives here as `number` (the legacy `Float` columns), as a string, or
 * as a Prisma `Decimal` — which is an object, so `String(v)` on it would give
 * "[object Object]" were it not for its own toString. Normalise all three to a
 * plain decimal string so a before/after pair is comparable as text.
 */
function val(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.slice(0, 2000);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  // Prisma.Decimal and anything else carrying its own toString (never the
  // default Object.prototype one, which would silently log "[object Object]").
  if (typeof v === "object" && v !== null) {
    const asStr = (v as { toString?: () => string }).toString;
    if (typeof asStr === "function" && asStr !== Object.prototype.toString) {
      return asStr.call(v).slice(0, 2000);
    }
    try {
      return JSON.stringify(v).slice(0, 2000);
    } catch {
      return null;
    }
  }
  return String(v);
}

/** A single field change, in the shape the rest of the app uses. */
export type GrantChange = { field: string; from?: unknown; to?: unknown };

/**
 * Diff a patch against the row it is being applied to, so an edit records what
 * actually changed rather than the whole payload. Keys whose value is
 * `undefined` (not part of the patch) are skipped.
 */
export function diffGrantChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): GrantChange[] {
  const out: GrantChange[] = [];
  for (const [field, to] of Object.entries(patch)) {
    if (to === undefined) continue;
    const from = before[field];
    if (val(from) === val(to)) continue;
    out.push({ field, from, to });
  }
  return out;
}

/** Low-level writer. Prefer the named helpers below. */
export function logGrant(
  entityType: AuditEntityType,
  entityId: string,
  userId: string,
  action: string,
  change?: { field?: string; from?: unknown; to?: unknown },
): void {
  auditLog({
    entityType,
    entityId,
    userId,
    action,
    field: change?.field,
    oldValue: val(change?.from),
    newValue: val(change?.to),
  });
}

/** One row per changed field, written as a single batch. */
export function logGrantChanges(
  entityType: AuditEntityType,
  entityId: string,
  userId: string,
  action: string,
  changes: GrantChange[],
): void {
  if (!changes.length) return;
  const entries: AuditEntry[] = changes.map((c) => ({
    entityType,
    entityId,
    userId,
    action,
    field: c.field,
    oldValue: val(c.from),
    newValue: val(c.to),
  }));
  auditLogMany(entries);
}

// ── Budget lifecycle ────────────────────────────────────────────────────────

/**
 * A budget changed status. `from` is read BEFORE the write — the whole point,
 * since the update overwrites it and nothing else keeps the previous state.
 */
export function logBudgetStatus(
  budgetId: string,
  userId: string,
  detail: { from: string; to: string; note?: string },
): void {
  logGrant("Budget", budgetId, userId, `status_${detail.to}`, {
    field: detail.note ?? "status",
    from: detail.from,
    to: detail.to,
  });
}

/**
 * A budget was approved. Logged separately from the status change because the
 * amount approved is the single most important number in the system and must be
 * recoverable even if `approvedAmount` is later edited.
 */
export function logBudgetApproval(
  budgetId: string,
  userId: string,
  detail: { amount?: unknown; decisionId?: string },
): void {
  logGrant("Budget", budgetId, userId, "approved", {
    field: detail.decisionId ? `decision:${detail.decisionId}` : "approvedAmount",
    to: detail.amount,
  });
}

/** Report config was created or changed — this moves every reporting deadline. */
export function logReportConfig(
  budgetId: string,
  userId: string,
  changes: GrantChange[],
  slotCount: number,
): void {
  logGrantChanges("Budget", budgetId, userId, "report_config", changes);
  logGrant("Budget", budgetId, userId, "report_slots_generated", {
    field: "slots",
    to: slotCount,
  });
}

/**
 * Lines were rewritten in bulk (regenerate, import, scale). ONE row with counts
 * — a per-line diff of a 400-line budget would bury everything else.
 */
export function logBudgetLinesBulk(
  budgetId: string,
  userId: string,
  action: "regenerated" | "imported" | "rescaled" | "deleted",
  detail: { lineCount: number; totalBefore?: unknown; totalAfter?: unknown },
): void {
  logGrant("Budget", budgetId, userId, `lines_${action}`, {
    field: `${detail.lineCount} line(s)`,
    from: detail.totalBefore,
    to: detail.totalAfter,
  });
}

/** A single line edited by hand. Post-approval edits are the interesting ones. */
export function logBudgetLineEdit(
  lineId: string,
  userId: string,
  detail: { budgetId: string; afterApproval: boolean; changes: GrantChange[] },
): void {
  logGrantChanges(
    "BudgetLine",
    lineId,
    userId,
    detail.afterApproval ? "edited_after_approval" : "edited",
    detail.changes.map((c) => ({ ...c, field: `${detail.budgetId}:${c.field}` })),
  );
}

// ── Reporting ───────────────────────────────────────────────────────────────

/** The grantee submitted a report. */
export function logReportSubmit(
  reportId: string,
  userId: string,
  detail: { slotId: string; totalActual?: unknown },
): void {
  logGrant("BudgetReport", reportId, userId, "submitted", {
    field: `slot:${detail.slotId}`,
    to: detail.totalActual,
  });
}

/** A report was approved, sent back or reopened. */
export function logReportDecision(
  reportId: string,
  userId: string,
  action: "approved" | "sent_back" | "reopened",
  detail: { from?: string; note?: string },
): void {
  logGrant("BudgetReport", reportId, userId, action, {
    field: detail.note ?? "status",
    from: detail.from,
    to: action,
  });
}

// ── Reallocation ────────────────────────────────────────────────────────────

/** A reallocation was raised by the grantee. */
export function logReallocationRaised(
  requestId: string,
  userId: string,
  detail: { budgetId: string; amount?: unknown; fromSection?: string; toSection?: string },
): void {
  logGrant("Reallocation", requestId, userId, "raised", {
    field: `${detail.budgetId}:${detail.fromSection ?? "?"}→${detail.toSection ?? "?"}`,
    to: detail.amount,
  });
}

/**
 * A reallocation was approved or rejected. This moves money between heads
 * inside an approved grant, so it is an approval in substance whatever the UI
 * calls it, and it is logged as one.
 */
export function logReallocationResolved(
  requestId: string,
  userId: string,
  detail: { decision: "approved" | "rejected"; amount?: unknown; note?: string },
): void {
  logGrant("Reallocation", requestId, userId, detail.decision, {
    field: detail.note ?? "amount",
    to: detail.amount,
  });
}

// ── Cost registry ───────────────────────────────────────────────────────────

/**
 * A registry rate changed. Every budget generated afterwards inherits it, so
 * this is the highest-leverage edit in the portal and until now left no trace
 * beyond `CostRegistryHistory` (which records the value, not the person).
 */
export function logRegistryRate(
  itemId: string,
  userId: string,
  detail: { itemKey: string; from?: unknown; to?: unknown; city?: string },
): void {
  logGrant("CostRegistry", itemId, userId, "rate_changed", {
    field: detail.city ? `${detail.city}:${detail.itemKey}` : detail.itemKey,
    from: detail.from,
    to: detail.to,
  });
}

/** A registry-wide operation (seed, bulk inflation, refreeze). One row. */
export function logRegistryBulk(
  userId: string,
  action: string,
  detail: { scope: string; count: number },
): void {
  logGrant("CostRegistry", detail.scope, userId, action, {
    field: `${detail.count} item(s)`,
    to: detail.scope,
  });
}

// ── Overrides ───────────────────────────────────────────────────────────────

/**
 * Someone pushed past a gate the system refused: released against an open
 * condition, closed a grant with exceptions, approved above their ceiling under
 * a break-glass grant. These are the rows an auditor reads first, so the
 * blockers that were overridden are recorded verbatim rather than counted.
 */
export function logGateOverride(
  entityType: AuditEntityType,
  entityId: string,
  userId: string,
  detail: { gate: string; blockers: string[]; reason: string },
): void {
  logGrant(entityType, entityId, userId, "gate_override", {
    field: detail.gate,
    from: detail.blockers.join("; ") || "no blockers recorded",
    to: detail.reason,
  });
}
