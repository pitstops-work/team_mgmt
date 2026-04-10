import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId   = searchParams.get("entityId");

  if (!entityType || !entityId) return Response.json({ error: "entityType and entityId required" }, { status: 400 });

  const retros = await prisma.retrospective.findMany({
    where: { entityType, entityId },
    include: { author: { select: { id: true, name: true, image: true } } },
    orderBy: { createdAt: "desc" },
  });

  return Response.json(retros);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { entityType, entityId, wentWell, couldImprove, keyLearning } = await req.json();
  if (!entityType || !entityId) return Response.json({ error: "entityType and entityId required" }, { status: 400 });

  const retro = await prisma.retrospective.create({
    data: {
      entityType,
      entityId,
      authorId: session.user.id,
      wentWell,
      couldImprove,
      keyLearning,
    },
    include: { author: { select: { id: true, name: true, image: true } } },
  });

  return Response.json(retro);
}
