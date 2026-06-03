import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { buildBudgetWorkbook, type ExportLine } from "@/lib/budget/exportTemplate";
import { formatCostDriver, type RegistryItem } from "@/lib/budget/costDriver";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });

  const budget = await prisma.budget.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } } },
  });
  if (!budget || budget.partnerId !== session.user.id) return new NextResponse("Not found", { status: 404 });

  // Pull templates + cost registry for this city so the Working sheet can show
  // a per-programme-line cost-driver trail.
  const [templates, registryRows] = await Promise.all([
    prisma.lineTemplate.findMany({
      where: { city: budget.city },
      select: {
        templateKey: true, isSalaryStub: true, userInputCost: true,
        costKey: true, costKey2: true, costKey3: true, costMonthly: true,
        workerRatioKey: true, bufferKey: true, costPctOf: true, costPct: true,
      },
    }),
    prisma.costRegistry.findMany({
      where: { city: budget.city },
      select: { itemKey: true, unitCost: true, unit: true },
    }),
  ]);

  const registry: RegistryItem[] = registryRows;
  const driverByTemplateKey = new Map<string, string>();
  for (const t of templates) {
    const trail = formatCostDriver(t, registry);
    if (trail) driverByTemplateKey.set(t.templateKey, trail);
  }

  const lines: ExportLine[] = budget.lines.map(l => ({
    domain: l.domain,
    section: l.section,
    description: l.description,
    costCategory: l.costCategory,
    unitType: l.unitType,
    notes: l.notes,
    salaryHint: l.salaryHint,
    templateKey: l.templateKey,
    costDriver: l.templateKey ? (driverByTemplateKey.get(l.templateKey) ?? null) : null,
    y1Units: l.y1Units, y1UnitCost: l.y1UnitCost, y1AllocPct: l.y1AllocPct, y1Total: l.y1Total,
    y2Units: l.y2Units, y2UnitCost: l.y2UnitCost, y2AllocPct: l.y2AllocPct, y2Total: l.y2Total,
    y3Units: l.y3Units, y3UnitCost: l.y3UnitCost, y3AllocPct: l.y3AllocPct, y3Total: l.y3Total,
  }));

  const buffer = await buildBudgetWorkbook({
    name: budget.name,
    domains: budget.domains,
    years: budget.years,
    lines,
  });

  const safeName = budget.name.replace(/[^a-z0-9]/gi, "_").substring(0, 40);
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}_budget.xlsx"`,
    },
  });
}
