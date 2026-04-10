import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ goalId: string; metricId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { metricId } = await params;
  await prisma.goalMetric.update({ where: { id: metricId }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
