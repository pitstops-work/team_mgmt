import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const rows = await prisma.pitstopTheme.findMany({
    where: { pitstopId },
    include: { theme: true },
  });

  return Response.json(rows.map((r) => r.theme));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { themeId } = await req.json();
  if (!themeId) return Response.json({ error: "themeId required" }, { status: 400 });

  await prisma.pitstopTheme.upsert({
    where: { pitstopId_themeId: { pitstopId, themeId } },
    create: { pitstopId, themeId },
    update: {},
  });

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ pitstopId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { pitstopId } = await params;
  const { themeId } = await req.json();
  if (!themeId) return Response.json({ error: "themeId required" }, { status: 400 });

  await prisma.pitstopTheme.deleteMany({ where: { pitstopId, themeId } });
  return Response.json({ ok: true });
}
