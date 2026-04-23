import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { DbPitstop, interpolatePitstops } from "@/lib/templateDb";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { params: templateParams } = await req.json();

  const rows = await prisma.$queryRaw<{ pitstops: unknown }[]>`
    SELECT pitstops FROM "GoalTemplateDef"
    WHERE slug = ${id} AND "isActive" = true
    LIMIT 1
  `;
  if (!rows[0]) return Response.json({ error: "Template not found" }, { status: 404 });

  const pitstops = interpolatePitstops(rows[0].pitstops as DbPitstop[], templateParams ?? {});
  return Response.json(pitstops);
}
