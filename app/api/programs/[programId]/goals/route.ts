import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const { goalId } = await req.json();
  if (!goalId) return Response.json({ error: "goalId required" }, { status: 400 });

  await prisma.programGoal.upsert({
    where: { programId_goalId: { programId, goalId } },
    create: { programId, goalId },
    update: {},
  });

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { programId } = await params;
  const { goalId } = await req.json();

  await prisma.programGoal.deleteMany({ where: { programId, goalId } });
  return Response.json({ ok: true });
}
