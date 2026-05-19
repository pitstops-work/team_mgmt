import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { auditLog } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { currentPassword, newPassword } = await req.json();
  if (!currentPassword || !newPassword)
    return Response.json({ error: "Both fields required" }, { status: 400 });
  if (newPassword.length < 8)
    return Response.json({ error: "New password must be at least 8 characters" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.password)
    return Response.json({ error: "No password set on this account" }, { status: 400 });

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid)
    return Response.json({ error: "Current password is incorrect" }, { status: 400 });

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: session.user.id }, data: { password: hashed } });

  auditLog({
    entityType: "User",
    entityId: session.user.id,
    userId: session.user.id,
    action: "password_change",
  });

  return Response.json({ ok: true });
}
