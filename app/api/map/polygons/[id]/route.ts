import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const updated = await prisma.mapPolygon.update({
    where: { id },
    data: {
      ...(body.partnerKey !== undefined && { partnerKey: String(body.partnerKey) }),
      ...(body.zone !== undefined && { zone: String(body.zone) }),
      ...(body.cluster !== undefined && { cluster: String(body.cluster) }),
      ...(body.name !== undefined && { name: String(body.name) }),
      ...(body.description !== undefined && { description: String(body.description) }),
    },
  });

  return NextResponse.json(updated);
}
