import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const goals = await prisma.goal.findMany({
    where: { deletedAt: null },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return Response.json(goals);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, status } = await req.json();
  if (!title) return Response.json({ error: "Title required" }, { status: 400 });

  const goal = await prisma.goal.create({
    data: { title, description, status: status ?? "Active", ownerId: session.user.id },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      pitstops: { select: { id: true, status: true } },
    },
  });

  return Response.json(goal, { status: 201 });
}
