import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const threads = await prisma.thread.findMany({
    where: { pitstopId },
    include: {
      messages: {
        include: {
          author: { select: { id: true, name: true, image: true } },
          attachments: true,
          mentions: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return Response.json(threads);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { name } = await req.json();
  if (!name) return Response.json({ error: "Name required" }, { status: 400 });

  const thread = await prisma.thread.create({
    data: { name, pitstopId },
    include: { messages: true },
  });

  return Response.json(thread, { status: 201 });
}
