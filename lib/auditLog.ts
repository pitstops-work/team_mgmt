import prisma from "./prisma";

export type AuditEntityType =
  | "Goal"
  | "Pitstop"
  | "User"
  | "System"
  | "Activity"   // PitstopEvent
  | "Checklist"; // ChecklistItem

export type AuditEntry = {
  entityType: AuditEntityType;
  entityId: string;
  userId: string;
  action: string;
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
};

/**
 * Fire-and-forget audit log writer. Never blocks the response and never throws.
 * Use for sensitive actions (user CRUD, role changes, password resets, portal access).
 */
export function auditLog(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        entityType: entry.entityType,
        entityId: entry.entityId,
        userId: entry.userId,
        action: entry.action,
        field: entry.field ?? null,
        oldValue: entry.oldValue ?? null,
        newValue: entry.newValue ?? null,
      },
    })
    .catch((err) => {
      console.error("[auditLog] failed to write entry", { entry, err });
    });
}

/** Fire-and-forget batched write — used for field-diff audits. */
export function auditLogMany(entries: AuditEntry[]): void {
  if (!entries.length) return;
  prisma.auditLog
    .createMany({
      data: entries.map((e) => ({
        entityType: e.entityType,
        entityId: e.entityId,
        userId: e.userId,
        action: e.action,
        field: e.field ?? null,
        oldValue: e.oldValue ?? null,
        newValue: e.newValue ?? null,
      })),
    })
    .catch((err) => {
      console.error("[auditLog] failed to write batch", { count: entries.length, err });
    });
}

/**
 * Stringify a value for AuditLog.oldValue/newValue. Dates → ISO, null/undefined → null.
 */
function stringify(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Build field-change audit entries by comparing old/new field maps.
 * `newVals` keys with `undefined` are skipped (treated as "not provided").
 * Equal values (after stringification) are skipped. Returns one entry per changed field.
 */
export function diffAudit(
  entityType: AuditEntityType,
  entityId: string,
  userId: string,
  oldVals: Record<string, unknown>,
  newVals: Record<string, unknown>,
): AuditEntry[] {
  const entries: AuditEntry[] = [];
  for (const field of Object.keys(newVals)) {
    if (newVals[field] === undefined) continue;
    const oldStr = stringify(oldVals[field]);
    const newStr = stringify(newVals[field]);
    if (oldStr === newStr) continue;
    entries.push({
      entityType, entityId, userId,
      action: `${field}_change`, field,
      oldValue: oldStr, newValue: newStr,
    });
  }
  return entries;
}
