import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET  — all active domain configs (used everywhere to build domain lists)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.needsFormulaConfig.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  return Response.json(rows);
}

// PATCH — bulk update denominator/description for existing domains (settings table)
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const updates: { domain: string; denominator: number | null; description?: string }[] = await req.json();

  await Promise.all(
    updates.map(({ domain, denominator, description }) =>
      prisma.needsFormulaConfig.update({
        where: { domain },
        data: { denominator: denominator ?? undefined, description: description ?? undefined },
      })
    )
  );

  const rows = await prisma.needsFormulaConfig.findMany({ orderBy: { sortOrder: "asc" } });
  return Response.json(rows);
}

// POST — create a brand-new domain
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { key, label, color, domainType, denominator, populationField, description } = await req.json();

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
      denominator: denominator ?? null,
      populationField: populationField ?? null,
      description: description ?? null,
      sortOrder,
      isActive: true,
    },
  });

  return Response.json(row, { status: 201 });
}
