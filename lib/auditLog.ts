import prisma from "./prisma";

export type AuditEntry = {
  entityType: "Goal" | "Pitstop" | "User" | "System";
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
