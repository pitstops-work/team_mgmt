import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const themes = await prisma.theme.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { goals: true } } },
    orderBy: { name: "asc" },
  });

  return Response.json(themes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, color } = await req.json();
  if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  const theme = await prisma.theme.create({
    data: { name: name.trim(), color: color?.trim() || null },
    include: { _count: { select: { goals: true } } },
  });

  return Response.json(theme);
}
