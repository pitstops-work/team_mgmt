import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Indian Financial Year: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
// `year` stored is the FY year (the April start year)
// e.g. FY2025: Q1=Apr25-Jun25, Q2=Jul25-Sep25, Q3=Oct25-Dec25, Q4=Jan26-Mar26
const FY_QUARTERS: Record<number, { startM: number; endM: number; calYearOffset: number }> = {
  1: { startM: 3,  endM: 5,  calYearOffset: 0 }, // Apr–Jun
  2: { startM: 6,  endM: 8,  calYearOffset: 0 }, // Jul–Sep
  3: { startM: 9,  endM: 11, calYearOffset: 0 }, // Oct–Dec
  4: { startM: 0,  endM: 2,  calYearOffset: 1 }, // Jan–Mar (next calendar year)
};

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

  const { startM, endM, calYearOffset } = FY_QUARTERS[q];
  const calYear = y + calYearOffset;
  const startDate = new Date(calYear, startM, 1);
  const endDate   = new Date(calYear, endM + 1, 0); // last day of endM

  const quarterRecord = await prisma.quarter.create({
    data: { year: y, quarter: q, startDate, endDate, focus: focus?.trim() || null },
    include: { goals: true },
  });

  return Response.json(quarterRecord);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  await prisma.quarter.update({ where: { id }, data: { deletedAt: new Date() } });
  return Response.json({ ok: true });
}
