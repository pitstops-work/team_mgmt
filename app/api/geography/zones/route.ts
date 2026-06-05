import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, cityId } = await req.json();
  if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  const zone = await prisma.zone.create({
    data: { name: name.trim(), cityId: cityId ?? null },
  });
  return Response.json(zone);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.zone.update({ where: { id }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
