import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";

const VALID_ROLES = ["admin", "member", "viewer"] as const;
const VALID_DESIGNATIONS = ["RP", "ZL", "PM", "Other"] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { name, email, role, cityId, designation, zoneIds } = await req.json();

  if (role && !VALID_ROLES.includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }
  if (designation && !VALID_DESIGNATIONS.includes(designation)) {
    return Response.json({ error: "Invalid designation" }, { status: 400 });
  }

  // Only super-admin can grant or revoke the admin role
  if (role === "admin" || (role && role !== "admin")) {
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    const changingAdminStatus = role === "admin" || targetUser?.role === "admin";
    if (changingAdminStatus && !isSuperAdmin(session?.user?.email)) {
      return Response.json({ error: "Only the super-admin can change admin role" }, { status: 403 });
    }
  }

  // If email is changing, check it's not already taken
  if (email) {
    const conflict = await prisma.user.findFirst({
      where: { email, NOT: { id } },
      select: { id: true },
    });
    if (conflict) {
      return Response.json({ error: "Email already in use" }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name || null }),
      ...(email && { email }),
      ...(role && { role }),
      ...(cityId !== undefined && { cityId: cityId || null }),
      ...(designation && { designation }),
    },
    select: { id: true, name: true, email: true, role: true, designation: true, createdAt: true, image: true, cityId: true },
  });

  // Update zone lead assignments if provided
  if (Array.isArray(zoneIds)) {
    // Clear this user's existing zone leads, then set the new ones
    await prisma.zone.updateMany({ where: { leadId: id }, data: { leadId: null } });
    if (zoneIds.length > 0) {
      await prisma.zone.updateMany({ where: { id: { in: zoneIds } }, data: { leadId: id } });
    }
  }

  return Response.json(user);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session!.user!.id) {
    return Response.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
