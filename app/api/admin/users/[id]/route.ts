import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";

const VALID_ROLES = ["super-admin", "admin", "member", "viewer"] as const;
const VALID_DESIGNATIONS = ["RP", "ZL", "PM", "Leader", "Other"] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!isAdminUser(session)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { name, email, role, cityId, designation, zoneIds, clusterIds, reportsToId } = await req.json();

  if (role && !VALID_ROLES.includes(role)) {
    return Response.json({ error: "Invalid role" }, { status: 400 });
  }
  if (designation && !VALID_DESIGNATIONS.includes(designation)) {
    return Response.json({ error: "Invalid designation" }, { status: 400 });
  }

  // Only super-admin can grant, revoke, or change admin/super-admin roles
  if (role) {
    const targetUser = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    const involvesSuperAdmin = role === "super-admin" || targetUser?.role === "super-admin";
    const involvesAdmin = role === "admin" || targetUser?.role === "admin";
    if ((involvesSuperAdmin || involvesAdmin) && !isSuperAdmin(session)) {
      return Response.json({ error: "Only the super-admin can change admin or super-admin roles" }, { status: 403 });
    }
    // Prevent removing super-admin from themselves
    if (targetUser?.role === "super-admin" && role !== "super-admin" && id === session?.user?.id) {
      return Response.json({ error: "Cannot remove your own super-admin role" }, { status: 400 });
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
      ...(reportsToId !== undefined && { reportsToId: reportsToId || null }),
    },
    select: { id: true, name: true, email: true, role: true, designation: true, createdAt: true, image: true, cityId: true, reportsToId: true },
  });

  // Update zone lead assignments if provided (ZL/PM)
  if (Array.isArray(zoneIds)) {
    await prisma.zone.updateMany({ where: { leadId: id }, data: { leadId: null } });
    if (zoneIds.length > 0) {
      await prisma.zone.updateMany({ where: { id: { in: zoneIds } }, data: { leadId: id } });
    }
  }

  // Update RP cluster assignments if provided
  if (Array.isArray(clusterIds)) {
    await prisma.user.update({
      where: { id },
      data: { rpClusters: { set: clusterIds.map(cid => ({ id: cid })) } },
    });
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

  // Only super-admin can delete admin/super-admin users
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if ((target?.role === "admin" || target?.role === "super-admin") && !isSuperAdmin(session)) {
    return Response.json({ error: "Only the super-admin can delete admin users" }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });
  return Response.json({ ok: true });
}
