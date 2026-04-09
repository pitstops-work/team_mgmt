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
          pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
        },
      },
    },
  },
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const programs = await prisma.program.findMany({
    where: { deletedAt: null },
    include,
    orderBy: { createdAt: "desc" },
  });

  return Response.json(programs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description } = await req.json();
  if (!title?.trim()) return Response.json({ error: "Title required" }, { status: 400 });

  const program = await prisma.program.create({
    data: { title: title.trim(), description: description?.trim() || null, ownerId: session.user.id },
    include,
  });

  return Response.json(program, { status: 201 });
}
