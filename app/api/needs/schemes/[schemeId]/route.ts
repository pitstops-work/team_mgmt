import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { schemeId } = await params;
  const data = await req.json();

  const scheme = await prisma.entitlementScheme.update({
    where: { id: schemeId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.parentId !== undefined && { parentId: data.parentId }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
  return Response.json(scheme);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ schemeId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { schemeId } = await params;
  await prisma.entitlementScheme.delete({ where: { id: schemeId } });
  return Response.json({ ok: true });
}
