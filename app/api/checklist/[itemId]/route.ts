import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { autoAdvancePitstopFromItem } from "@/lib/autoAdvancePitstop";
import { captureIndicatorPointsForChecklistItem, captureJourneyOutcomePointsForChecklistItem } from "@/lib/captureIndicatorPoints";
import { buildRbacContext, checklistItemInScope } from "@/lib/rbac";
import { auditLog, auditLogMany, diffAudit } from "@/lib/auditLog";

const VALID_STATUSES = [
  "NotStarted", "Scheduled", "InProgress", "Done", "Blocked", "Rescheduled", "Cancelled",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { itemId } = await params;
  // Editing any field of a checklist item (incl. ticking it Done) requires the
  // checklist_item.update permission, scoped to the parent pitstop (own/team/all).
  // Completing the linked activity is a separate path governed by pitstop_event.update.
  const ctx = await buildRbacContext(session, { req });
  if (!(await checklistItemInScope(ctx, itemId, "update"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = session.user.id;
  const { checked, text, status, assigneeId, notes, indicatorValues } = await req.json();

  // Snapshot existing values for audit diff
  const existing = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { status: true, checked: true, text: true, assigneeId: true, notes: true },
  });

  // Sync checked ↔ status
  let resolvedChecked = checked;
  let resolvedStatus = status;
  if (status === "Done") resolvedChecked = true;
  if (checked === true && !status) resolvedStatus = "Done";
  if (checked === false && !status) resolvedStatus = "NotStarted";

  if (resolvedStatus !== undefined && !VALID_STATUSES.includes(resolvedStatus)) {
    return Response.json({ error: "Invalid status" }, { status: 400 });
  }

  // Use CASE for nullable fields so passing undefined preserves the existing value
  const item = await prisma.$executeRaw`
    UPDATE "ChecklistItem"
    SET
      "checked"     = COALESCE(${resolvedChecked ?? null}::boolean, "checked"),
      "text"        = COALESCE(${text?.trim() ?? null}::text, "text"),
      "status"      = COALESCE(${resolvedStatus ?? null}::"ChecklistItemStatus", "status"),
      "completedAt" = CASE
        WHEN ${resolvedStatus === "Done"}::boolean THEN NOW()
        WHEN ${resolvedStatus !== undefined && resolvedStatus !== "Done"}::boolean THEN NULL
        ELSE "completedAt"
      END,
      "completedById" = CASE
        WHEN ${resolvedStatus === "Done"}::boolean THEN ${actorId}
        WHEN ${resolvedStatus !== undefined && resolvedStatus !== "Done"}::boolean THEN NULL
        ELSE "completedById"
      END,
      "assigneeId"      = CASE WHEN ${assigneeId !== undefined}::boolean THEN ${assigneeId ?? null}::text ELSE "assigneeId" END,
      "notes"           = CASE WHEN ${notes !== undefined}::boolean THEN ${notes ?? null}::text ELSE "notes" END,
      "lastUpdatedById" = ${actorId},
      "updatedAt"       = NOW()
    WHERE id = ${itemId}
  `;

  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  if (existing) {
    auditLogMany(diffAudit("Checklist", itemId, actorId,
      { status: existing.status, checked: existing.checked, text: existing.text, assigneeId: existing.assigneeId, notes: existing.notes },
      { status: resolvedStatus, checked: resolvedChecked, text: text?.trim(), assigneeId: assigneeId !== undefined ? (assigneeId ?? null) : undefined, notes: notes !== undefined ? (notes ?? null) : undefined },
    ));
  }

  if (resolvedStatus === "Done") {
    await autoAdvancePitstopFromItem(itemId);
    if (indicatorValues && typeof indicatorValues === "object") {
      const values = indicatorValues as Record<string, number>;
      try {
        await captureIndicatorPointsForChecklistItem({
          itemId, values, capturedById: session.user.id,
        });
      } catch (e) {
        console.error("[checklist PATCH] Layer 2 capture failed:", e);
      }
      try {
        await captureJourneyOutcomePointsForChecklistItem({
          itemId, values, capturedById: session.user.id,
        });
      } catch (e) {
        console.error("[checklist PATCH] Layer 3 capture failed:", e);
      }
    }
  }

  const updated = await prisma.$queryRaw<{
    id: string; text: string; checked: boolean; order: number;
    status: string; assigneeId: string | null; notes: string | null;
  }[]>`
    SELECT id, text, checked, "order", status::text, "assigneeId", notes
    FROM "ChecklistItem" WHERE id = ${itemId} LIMIT 1
  `;

  return Response.json(updated[0] ?? { ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { itemId } = await params;
  const ctx = await buildRbacContext(session, { req });
  if (!(await checklistItemInScope(ctx, itemId, "delete"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.checklistItem.delete({ where: { id: itemId } });
  auditLog({ entityType: "Checklist", entityId: itemId, userId: session.user.id, action: "deleted" });
  return Response.json({ ok: true });
}
