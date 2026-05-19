import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { adminForbidden } from "@/lib/roleGuard";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { name, clusterId } = await req.json();
  if (!name?.trim() || !clusterId) return Response.json({ error: "name and clusterId required" }, { status: 400 });

  const settlement = await prisma.settlement.create({ data: { name: name.trim(), clusterId } });
  return Response.json(settlement);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id, clusterId } = await req.json();
  if (!id || !clusterId) return Response.json({ error: "id and clusterId required" }, { status: 400 });

  const settlement = await prisma.settlement.update({
    where: { id },
    data: { clusterId },
    select: { id: true, name: true, clusterId: true },
  });
  return Response.json(settlement);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const { id } = await req.json();
  await prisma.settlement.update({ where: { id }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
