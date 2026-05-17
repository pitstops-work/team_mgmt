import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser } from "@/lib/roleGuard";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; bindingId: string }> },
) {
  const session = await auth();
  if (!isAdminUser(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, bindingId } = await params;

  await prisma.$executeRaw`
    DELETE FROM "ActivityIndicatorBinding"
    WHERE id = ${bindingId} AND "defId" = ${id}
  `;

  return Response.json({ ok: true });
}
