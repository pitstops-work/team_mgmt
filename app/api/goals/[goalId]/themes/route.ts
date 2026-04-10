import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { themeId } = await req.json();
  if (!themeId) return Response.json({ error: "themeId required" }, { status: 400 });

  await prisma.goalTheme.upsert({
    where: { goalId_themeId: { goalId, themeId } },
    create: { goalId, themeId },
    update: {},
  });

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { themeId } = await req.json();
  if (!themeId) return Response.json({ error: "themeId required" }, { status: 400 });

  await prisma.goalTheme.deleteMany({ where: { goalId, themeId } });
  return Response.json({ ok: true });
}
