import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const quarters = await prisma.quarter.findMany({
    where: { deletedAt: null },
    include: {
      goals: {
        include: {
          goal: {
            select: {
              id: true, title: true, status: true,
              pitstops: { where: { deletedAt: null }, select: { id: true, status: true } },
            },
          },
        },
      },
    },
    orderBy: [{ year: "desc" }, { quarter: "desc" }],
  });

  return Response.json(quarters);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { year, quarter, focus } = await req.json();
  if (!year || !quarter) return Response.json({ error: "year and quarter required" }, { status: 400 });

  const y = Number(year);
  const q = Number(quarter);
  if (q < 1 || q > 4) return Response.json({ error: "quarter must be 1-4" }, { status: 400 });

  const startMonth = (q - 1) * 3; // 0, 3, 6, 9
  const startDate = new Date(y, startMonth, 1);
  const endDate = new Date(y, startMonth + 3, 0); // last day of last month in quarter

  const quarterRecord = await prisma.quarter.create({
    data: {
      year: y,
      quarter: q,
      startDate,
      endDate,
      focus: focus?.trim() || null,
    },
    include: { goals: true },
  });

  return Response.json(quarterRecord);
}
