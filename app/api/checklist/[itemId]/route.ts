import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  const { checked, text } = await req.json();

  const item = await prisma.checklistItem.update({
    where: { id: itemId },
    data: {
      checked: checked !== undefined ? checked : undefined,
      text: text !== undefined ? text.trim() : undefined,
    },
  });

  return Response.json(item);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;
  await prisma.checklistItem.delete({ where: { id: itemId } });
  return Response.json({ ok: true });
}
