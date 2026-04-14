import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const schemes = await prisma.entitlementScheme.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true, sortOrder: true, isActive: true },
  });

  return Response.json(schemes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { name, parentId } = await req.json();
  if (!name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  const maxOrder = await prisma.entitlementScheme.aggregate({ _max: { sortOrder: true } });
  const scheme = await prisma.entitlementScheme.create({
    data: {
      name: name.trim(),
      parentId: parentId ?? null,
      sortOrder: (maxOrder._max.sortOrder ?? 0) + 10,
    },
  });
  return Response.json(scheme, { status: 201 });
}
