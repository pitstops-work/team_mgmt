import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { adminForbidden } from "@/lib/roleGuard";

// GET  — domain configs; ?all=1 returns all (including inactive) for admin settings
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const all = searchParams.get("all") === "1";

  const rows = await prisma.needsFormulaConfig.findMany({
    where: all ? undefined : { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return Response.json(rows);
}

// PATCH — bulk update fields for existing domains (settings table)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session); if (veto) return veto;

  const updates: {
    domain: string;
    numerator?: number | null;
    denominator?: number | null;
    description?: string;
    isActive?: boolean;
    label?: string;
    color?: string;
    sortOrder?: number;
    domainType?: string;
    populationField?: string | null;
    linkedSchemeId?: string | null;
    assessmentLevel?: string;
    civicGroup?: string | null;
    civicWeightGroup?: string | null;
  }[] = await req.json();

  await Promise.all(
    updates.map(({ domain, numerator, denominator, description, isActive, label, color, sortOrder, domainType, populationField, linkedSchemeId, assessmentLevel, civicGroup, civicWeightGroup }) =>
      prisma.needsFormulaConfig.update({
        where: { domain },
        data: {
          ...(numerator !== undefined ? { numerator: numerator ?? 1 } : {}),
          ...(denominator !== undefined ? { denominator: denominator ?? null } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(label !== undefined ? { label } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          ...(domainType !== undefined ? { domainType } : {}),
          ...(populationField !== undefined ? { populationField: populationField ?? null } : {}),
          ...(linkedSchemeId !== undefined ? { linkedSchemeId: linkedSchemeId ?? null } : {}),
          ...(civicGroup !== undefined ? { civicGroup: civicGroup ?? null } : {}),
          ...(civicWeightGroup !== undefined ? { civicWeightGroup: civicWeightGroup ?? null } : {}),
          ...(assessmentLevel !== undefined ? {
            assessmentLevel,
            clusterScope: assessmentLevel === "cluster",
          } : {}),
        },
      })
    )
  );

  const rows = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json(rows);
}

// DELETE — permanently remove a domain config
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  if (!domain) return Response.json({ error: "domain query param required" }, { status: 400 });

  await prisma.needsFormulaConfig.delete({ where: { domain } });

  return Response.json({ ok: true });
}

// POST — create a brand-new domain
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { key, label, color, domainType, numerator, denominator, populationField, description, linkedSchemeId, assessmentLevel, civicGroup, civicWeightGroup } = await req.json();

  if (!key || !label) return Response.json({ error: "key and label are required" }, { status: 400 });

  // Auto-assign sortOrder after existing ones
  const max = await prisma.needsFormulaConfig.findFirst({ orderBy: { sortOrder: "desc" } });
  const sortOrder = (max?.sortOrder ?? 0) + 1;

  const isCount = (domainType ?? "count") === "count";
  const isFixed = domainType === "fixed";

  const row = await prisma.needsFormulaConfig.create({
    data: {
      domain: key,
      label,
      color: color ?? "#6b7280",
      domainType: domainType ?? "count",
      // numerator applies to both count ("X per N") and fixed ("N per scope").
      numerator: (isCount || isFixed) ? (numerator ?? 1) : 1,
      // denominator only applies to count.
      denominator: isCount ? (denominator ?? null) : null,
      populationField: (domainType === "entitlement" || domainType === "civic" || isFixed) ? null : (populationField ?? null),
      description: description ?? null,
      sortOrder,
      isActive: true,
      linkedSchemeId: domainType === "entitlement" ? (linkedSchemeId ?? null) : null,
      civicGroup: domainType === "civic" ? (civicGroup ?? null) : null,
      civicWeightGroup: isCount ? (civicWeightGroup ?? null) : null,
      assessmentLevel: assessmentLevel ?? "settlement",
      clusterScope: assessmentLevel === "cluster",
    },
  });

  return Response.json(row, { status: 201 });
}
