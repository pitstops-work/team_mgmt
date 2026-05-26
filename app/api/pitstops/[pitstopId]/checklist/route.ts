import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { auditLog } from "@/lib/auditLog";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pitstopId } = await params;
  const items = await prisma.checklistItem.findMany({
    where: { pitstopId },
    orderBy: { order: "asc" },
    select: {
      id: true, text: true, checked: true, status: true, completedAt: true,
      activities: {
        select: { id: true, title: true, status: true, scheduledAt: true, type: true, completedAt: true },
        orderBy: { scheduledAt: "asc" },
      },
    },
  });

  // completionType is an enum column Prisma's Lambda cache can silently drop;
  // read it via raw SQL (same pattern as the pitstop detail page) and merge in.
  const ids = items.map((i) => i.id);
  if (ids.length > 0) {
    const ctRows = await prisma.$queryRaw<{ id: string; completionType: string }[]>`
      SELECT id, "completionType"::text FROM "ChecklistItem" WHERE id = ANY(${ids})
    `;
    const ctMap = new Map(ctRows.map((r) => [r.id, r.completionType]));
    for (const it of items) {
      (it as Record<string, unknown>).completionType = ctMap.get(it.id) ?? "Activity";
    }
  }

  return Response.json(items);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return Response.json({ error: "Text required" }, { status: 400 });

  const count = await prisma.checklistItem.count({ where: { pitstopId } });
  const item = await prisma.checklistItem.create({
    data: { pitstopId, text: text.trim(), order: count },
  });

  auditLog({
    entityType: "Checklist", entityId: item.id, userId: session.user.id,
    action: "created", newValue: text.trim(),
  });

  return Response.json(item, { status: 201 });
}
