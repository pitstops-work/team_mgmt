import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { quarterId } = await req.json();
  if (!quarterId) return Response.json({ error: "quarterId required" }, { status: 400 });

  await prisma.goalQuarter.upsert({
    where: { goalId_quarterId: { goalId, quarterId } },
    create: { goalId, quarterId },
    update: {},
  });

  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { quarterId } = await req.json();
  if (!quarterId) return Response.json({ error: "quarterId required" }, { status: 400 });

  await prisma.goalQuarter.deleteMany({ where: { goalId, quarterId } });
  return Response.json({ ok: true });
}
