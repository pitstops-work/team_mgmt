import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import AssessmentForm from "./AssessmentForm";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

export default async function SettlementNeedsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await auth();

  const settlement = await prisma.settlement.findUnique({
    where: { id, deletedAt: null },
    include: {
      cluster: {
        include: { zone: { include: { city: true } } },
      },
      assessments: {
        orderBy: { assessedAt: "desc" },
        include: {
          assessedBy: { select: { id: true, name: true } },
          roads: true, water: true, sanitation: true,
          drainageSewer: true, drainageStorm: true,
          waste: true, electricity: true, facilities: true, safety: true,
          entitlements: { include: { scheme: { select: { id: true, name: true, parentId: true } } } },
        },
      },
    },
  });

  if (!settlement) notFound();

  const schemes = await prisma.entitlementScheme.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const formulas = await prisma.needsFormulaConfig.findMany();

  // Actuals from goals
  const goals = await prisma.goal.findMany({
    where: {
      needsDomain: { not: null },
      deletedAt: null,
      OR: [
        { needsSettlementId: id },
        { needsClusterId: settlement.clusterId },
      ],
    },
    select: {
      id: true, status: true, title: true, needsDomain: true, parameter: true,
      metrics: { where: { deletedAt: null }, select: { current: true }, take: 1 },
    },
  });

  return (
    <SurfaceProvider id="needs.settlement">
      <AssessmentForm
        settlement={JSON.parse(JSON.stringify(settlement))}
        schemes={JSON.parse(JSON.stringify(schemes))}
        formulas={JSON.parse(JSON.stringify(formulas))}
        goals={JSON.parse(JSON.stringify(goals))}
      />
    </SurfaceProvider>
  );
}
