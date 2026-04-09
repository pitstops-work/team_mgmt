import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

const include = {
  owner: { select: { id: true, name: true, image: true } },
  goals: {
    include: {
      goal: {
        include: {
          owner: { select: { id: true, name: true, image: true } },
          pitstops: {
            where: { deletedAt: null },
            select: { id: true, status: true, title: true, targetDate: true, startDate: true, ownerId: true, owner: { select: { id: true, name: true, image: true } } },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const program = await prisma.program.findUnique({ where: { id: programId, deletedAt: null }, include });
  if (!program) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(program);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const { title, description } = await req.json();

  const program = await prisma.program.update({
    where: { id: programId },
    data: { title: title?.trim(), description: description !== undefined ? (description?.trim() || null) : undefined },
    include,
  });
  return Response.json(program);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  await prisma.program.update({ where: { id: programId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
