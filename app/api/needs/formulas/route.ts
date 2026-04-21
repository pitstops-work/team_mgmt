import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

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

  const updates: {
    domain: string;
    denominator?: number | null;
    description?: string;
    isActive?: boolean;
    label?: string;
    color?: string;
    sortOrder?: number;
    linkedSchemeId?: string | null;
  }[] = await req.json();

  await Promise.all(
    updates.map(({ domain, denominator, description, isActive, label, color, sortOrder, linkedSchemeId }) =>
      prisma.needsFormulaConfig.update({
        where: { domain },
        data: {
          ...(denominator !== undefined ? { denominator: denominator ?? null } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
          ...(label !== undefined ? { label } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          ...(linkedSchemeId !== undefined ? { linkedSchemeId: linkedSchemeId ?? null } : {}),
        },
      })
    )
  );

  const rows = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json(rows);
}

// DELETE — soft-delete a domain by setting isActive: false
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get("domain");
  if (!domain) return Response.json({ error: "domain query param required" }, { status: 400 });

  await prisma.needsFormulaConfig.update({
    where: { domain },
    data: { isActive: false },
  });

  return Response.json({ ok: true });
}

// POST — create a brand-new domain
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { key, label, color, domainType, denominator, populationField, description, linkedSchemeId } = await req.json();

  if (!key || !label) return Response.json({ error: "key and label are required" }, { status: 400 });

  // Auto-assign sortOrder after existing ones
  const max = await prisma.needsFormulaConfig.findFirst({ orderBy: { sortOrder: "desc" } });
  const sortOrder = (max?.sortOrder ?? 0) + 1;

  const row = await prisma.needsFormulaConfig.create({
    data: {
      domain: key,
      label,
      color: color ?? "#6b7280",
      domainType: domainType ?? "count",
      denominator: domainType === "entitlement" ? null : (denominator ?? null),
      populationField: domainType === "entitlement" ? null : (populationField ?? null),
      description: description ?? null,
      sortOrder,
      isActive: true,
      linkedSchemeId: domainType === "entitlement" ? (linkedSchemeId ?? null) : null,
    },
  });

  return Response.json(row, { status: 201 });
}
