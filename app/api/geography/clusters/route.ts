import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { adminForbidden } from "@/lib/roleGuard";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { name, zoneId } = await req.json();
  if (!name?.trim() || !zoneId) return Response.json({ error: "name and zoneId required" }, { status: 400 });

  const cluster = await prisma.cluster.create({ data: { name: name.trim(), zoneId, geometrySource: "auto" } });
  return Response.json(cluster);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id, zoneId } = await req.json();
  if (!id || !zoneId) return Response.json({ error: "id and zoneId required" }, { status: 400 });

  const cluster = await prisma.cluster.update({
    where: { id },
    data: { zoneId },
    select: { id: true, name: true, zoneId: true },
  });
  return Response.json(cluster);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await req.json();
  await prisma.cluster.update({ where: { id }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
