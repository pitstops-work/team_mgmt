import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, clusterId } = await req.json();
  if (!name?.trim() || !clusterId) return Response.json({ error: "name and clusterId required" }, { status: 400 });

  const settlement = await prisma.settlement.create({ data: { name: name.trim(), clusterId } });
  return Response.json(settlement);
}
