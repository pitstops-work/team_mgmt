import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const metrics = await prisma.goalMetric.findMany({
    where: { goalId, deletedAt: null },
    include: {
      dataPoints: {
        orderBy: { date: "desc" },
        take: 5,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return Response.json(metrics);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { goalId } = await params;
  const { name, description, target, unit, frequency } = await req.json();

  if (!name?.trim() || target == null) {
    return Response.json({ error: "name and target required" }, { status: 400 });
  }

  const metric = await prisma.goalMetric.create({
    data: {
      goalId,
      name: name.trim(),
      description: description?.trim() || null,
      target: Number(target),
      unit: unit?.trim() || null,
      frequency: frequency ?? "Monthly",
    },
    include: { dataPoints: true },
  });

  return Response.json(metric);
}
