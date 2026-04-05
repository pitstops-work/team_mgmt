import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const data = await req.json();

  const pitstop = await prisma.pitstop.update({
    where: { id: pitstopId },
    data: { title: data.title, type: data.type, notes: data.notes, status: data.status },
    include: {
      attachments: true,
      threads: { select: { id: true, name: true, _count: { select: { messages: true } } } },
    },
  });

  return Response.json(pitstop);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  await prisma.pitstop.update({ where: { id: pitstopId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
