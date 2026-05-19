import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Admin can reset anyone except super-admin; only super-admin can reset super-admin.
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (!target) return Response.json({ error: "Not found" }, { status: 404 });
  if (target.role === "super-admin" && !isSuperAdmin(session)) {
    return Response.json({ error: "Only the super-admin can reset a super-admin's password" }, { status: 403 });
  }

  const { password } = await req.json();
  if (!password || password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.update({ where: { id }, data: { password: hashed } });

  auditLog({
    entityType: "User",
    entityId: id,
    userId: session!.user!.id!,
    action: "password_reset",
  });

  return Response.json({ ok: true });
}
