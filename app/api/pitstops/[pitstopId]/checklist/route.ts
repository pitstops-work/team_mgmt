import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pitstopId } = await params;
  const items = await prisma.checklistItem.findMany({
    where: { pitstopId },
    orderBy: { order: "asc" },
    select: { id: true, text: true, checked: true },
  });
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

  return Response.json(item, { status: 201 });
}
