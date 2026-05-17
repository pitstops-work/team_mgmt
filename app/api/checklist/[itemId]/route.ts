import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { autoAdvancePitstopFromItem } from "@/lib/autoAdvancePitstop";
import { captureIndicatorPointsForChecklistItem } from "@/lib/captureIndicatorPoints";

const VALID_STATUSES = [
  "NotStarted", "Scheduled", "InProgress", "Done", "Blocked", "Rescheduled", "Cancelled",
] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const { checked, text, status, assigneeId, notes, indicatorValues } = await req.json();

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
      "assigneeId"  = CASE WHEN ${assigneeId !== undefined}::boolean THEN ${assigneeId ?? null}::text ELSE "assigneeId" END,
      "notes"       = CASE WHEN ${notes !== undefined}::boolean THEN ${notes ?? null}::text ELSE "notes" END,
      "updatedAt"   = NOW()
    WHERE id = ${itemId}
  `;

  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  if (resolvedStatus === "Done") {
    await autoAdvancePitstopFromItem(itemId);
    if (indicatorValues && typeof indicatorValues === "object") {
      try {
        await captureIndicatorPointsForChecklistItem({
          itemId,
          values: indicatorValues as Record<string, number>,
          capturedById: session.user.id,
        });
      } catch (e) {
        console.error("[checklist PATCH] indicator capture failed:", e);
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

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  await prisma.checklistItem.delete({ where: { id: itemId } });
  return Response.json({ ok: true });
}
