import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";

const VALID_ROLES = ["super-admin", "admin", "member", "viewer", "budget-admin"] as const;
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

  // Look up the target + the actor's owner status once — both feed the
  // role-transition + owner-protection guards below and the audit snapshot.
  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { email: true, role: true, isOwner: true, designation: true, cityId: true, reportsToId: true },
  });
  const actorRow   = await prisma.user.findUnique({ where: { id: session!.user!.id! }, select: { isOwner: true } });
  const actorIsOwner = actorRow?.isOwner === true;

  // Owner-guard: only the owner can mutate the owner. Blocks demote, delete,
  // password reset (handled in its own route), and any field change.
  if (targetUser?.isOwner && id !== session?.user?.id) {
    return Response.json({ error: "Only the owner can modify the owner's account" }, { status: 403 });
  }

  // Only super-admin can grant, revoke, or change admin/super-admin roles
  if (role) {
    const involvesSuperAdmin = role === "super-admin" || targetUser?.role === "super-admin";
    const involvesAdmin = role === "admin" || targetUser?.role === "admin";
    if ((involvesSuperAdmin || involvesAdmin) && !isSuperAdmin(session)) {
      return Response.json({ error: "Only the super-admin can change admin or super-admin roles" }, { status: 403 });
    }
    // b2: minting super-admin is owner-only. Other super-admins can grant
    // admin freely; only the owner expands the super-admin club.
    if (role === "super-admin" && targetUser?.role !== "super-admin" && !actorIsOwner) {
      return Response.json({ error: "Only the owner can grant super-admin" }, { status: 403 });
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

  // Audit snapshot — reuse the targetUser fetch from above (saves a round-trip).
  const before = targetUser;

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

  // Audit sensitive field changes
  if (before) {
    const actorId = session!.user!.id!;
    const auditFields: Array<{ field: string; before: string | null | undefined; after: string | null | undefined }> = [
      { field: "role",         before: before.role,         after: user.role },
      { field: "designation",  before: before.designation,  after: user.designation },
      { field: "email",        before: before.email,        after: user.email },
      { field: "cityId",       before: before.cityId,       after: user.cityId },
      { field: "reportsToId",  before: before.reportsToId,  after: user.reportsToId },
    ];
    for (const f of auditFields) {
      if (f.before !== f.after) {
        auditLog({
          entityType: "User",
          entityId: id,
          userId: actorId,
          action: f.field === "role" ? "role_change" : "updated",
          field: f.field,
          oldValue: f.before ?? null,
          newValue: f.after ?? null,
        });
      }
    }
  }

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

  // Only super-admin can delete admin/super-admin users; the owner can only
  // be deleted by themselves (and even that is blocked by the self-check above).
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, isOwner: true } });
  if (target?.isOwner && id !== session?.user?.id) {
    return Response.json({ error: "Only the owner can delete the owner's account" }, { status: 403 });
  }
  if ((target?.role === "admin" || target?.role === "super-admin") && !isSuperAdmin(session)) {
    return Response.json({ error: "Only the super-admin can delete admin users" }, { status: 403 });
  }

  await prisma.user.delete({ where: { id } });

  auditLog({
    entityType: "User",
    entityId: id,
    userId: session!.user!.id!,
    action: "deleted",
    oldValue: target ? JSON.stringify({ role: target.role }) : null,
  });

  return Response.json({ ok: true });
}
