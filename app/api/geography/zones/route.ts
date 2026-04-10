import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  const zone = await prisma.zone.create({ data: { name: name.trim() } });
  return Response.json(zone);
}
