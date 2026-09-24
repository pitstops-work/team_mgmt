/**
 * The /field logbook.
 *
 * Until now the surface wrote no audit rows at all — the only auditLog() calls
 * under /field were ActionPoint side-effects in safety.ts and caregiver.ts. That
 * is a bad foundation for a system that will eventually answer "who did what,
 * when": the spine stamps the happy path (FieldStep.completedById/At,
 * FieldVisit.arrivedById/closedById, FieldVisitStep.completedById/At) but that
 * stamping is DESTROYED by the very actions you most want a record of — a reopen
 * clears completedById, so undoing a completion erases who had completed it.
 *
 * So the rule here is: the spine records what happened, the logbook records what
 * was UNDONE, OVERRIDDEN or RECONFIGURED.
 *
 *   - RP writes  → log reversals and overrides only (reopen, skip, force-close).
 *                  Ordinary completion is already stamped on the row; logging it
 *                  too would bury the interesting rows in noise.
 *   - Admin writes → log everything. Low volume, high consequence, and today
 *                  completely untracked.
 *   - Bulk ops   → ONE row carrying counts, never one row per goal. A resync over
 *                  a 30-intervention domain is a single operator decision.
 *
 * Every writer is fire-and-forget: auditLog never throws and never blocks the
 * response (lib/auditLog.ts). Rows surface in /settings/audit with no extra UI.
 */

import { auditLog, type AuditEntityType } from "@/lib/auditLog";

/** Compact a value for the oldValue/newValue text columns. */
function val(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.slice(0, 2000);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v).slice(0, 2000);
  } catch {
    return String(v);
  }
}

/** A single field change, for the per-field audit shape the rest of the app uses. */
export type FieldChange = { field: string; from?: unknown; to?: unknown };

/**
 * Diff a patch against the row it is being applied to, so an admin edit records
 * what actually changed rather than the whole payload. Keys whose value is
 * undefined (i.e. not part of the patch) are skipped.
 */
export function diffChanges(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const [field, to] of Object.entries(patch)) {
    if (to === undefined) continue;
    const from = before[field];
    if (val(from) === val(to)) continue;
    out.push({ field, from, to });
  }
  return out;
}

/** Low-level writer. Prefer the named helpers below. */
export function logField(
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

/** One row per changed field. Used by the admin PATCH routes. */
export function logFieldChanges(
  entityType: AuditEntityType,
  entityId: string,
  userId: string,
  action: string,
  changes: FieldChange[],
): void {
  for (const c of changes) logField(entityType, entityId, userId, action, c);
}

// ── RP surface: reversals and overrides ──────────────────────────────────────

/**
 * A completed setup step was reopened (or skipped). `previousCompletedById` is
 * read BEFORE the write, because the update clears it — capturing it here is the
 * entire reason this function exists.
 */
export function logStepReversal(
  stepId: string,
  userId: string,
  action: "reopened" | "skipped",
  detail: { title: string; previousCompletedById?: string | null },
): void {
  logField("FieldStep", stepId, userId, action, {
    field: detail.title,
    from: detail.previousCompletedById
      ? `completed by ${detail.previousCompletedById}`
      : "not previously completed",
    to: action,
  });
}

/** A visit step was un-ticked. Same reasoning as logStepReversal. */
export function logVisitStepUntick(
  visitId: string,
  userId: string,
  detail: { stepId: string; previousCompletedById?: string | null },
): void {
  logField("FieldVisit", visitId, userId, "step_unticked", {
    field: detail.stepId,
    from: detail.previousCompletedById
      ? `completed by ${detail.previousCompletedById}`
      : "not previously completed",
    to: "unticked",
  });
}

/**
 * A visit was closed with mandatory steps outstanding. The typed reason is
 * otherwise write-only (it lands in FieldVisit.note and no screen reads it back).
 */
export function logVisitForceClose(
  visitId: string,
  userId: string,
  detail: { reason: string; blockers: string[] },
): void {
  logField("FieldVisit", visitId, userId, "force_closed", {
    field: `${detail.blockers.length} blocker(s)`,
    from: detail.blockers.join("; ") || null,
    to: detail.reason,
  });
}

// ── Admin surface: bulk operations ───────────────────────────────────────────

/**
 * ONE row for a whole-domain operation. A resync rewrites steps across every
 * intervention in the domain; recording it per goal would be unreadable and
 * would misrepresent one operator decision as N.
 */
export function logDomainBulkOp(
  domain: string,
  userId: string,
  action: "resync_setup" | "resync_visit" | "derive_templates" | "assign_rp",
  counts: Record<string, unknown>,
): void {
  logField("FieldDomain", domain, userId, action, {
    field: "counts",
    to: counts,
  });
}
