import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";

function isAdminSession(role: string | undefined): boolean {
  return role === "admin" || role === "super-admin";
}

/** DELETE — revoke wiki-staff designation. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdminSession(session.user.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.wikiStaff.delete({ where: { id } });
  return Response.json({ ok: true });
}
