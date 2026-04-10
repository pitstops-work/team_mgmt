import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ goalId: string; metricId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { metricId } = await params;
  const { value, note, date } = await req.json();

  if (value == null) return Response.json({ error: "value required" }, { status: 400 });

  const dataPoint = await prisma.metricDataPoint.create({
    data: {
      metricId,
      value: Number(value),
      note: note?.trim() || null,
      date: date ? new Date(date) : new Date(),
      userId: session.user.id,
    },
  });

  // Update GoalMetric.current to the new value
  await prisma.goalMetric.update({
    where: { id: metricId },
    data: { current: Number(value) },
  });

  return Response.json(dataPoint);
}
