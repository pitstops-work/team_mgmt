import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";
import { invalidateRbacCache } from "@/lib/rbac";
import { seedPermissions, seedRole } from "@/lib/rbacSeed";

// POST /api/admin/rbac/roles/[roleId]/reset
// Reapplies the seed defaults for this role. Used by the admin UI's
// "Reset to defaults" button.
export async function POST(_req: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { roleId } = await params;
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return Response.json({ error: "Not found" }, { status: 404 });

  // Ensure the full permission catalog exists before re-seeding the role
  await seedPermissions();
  const count = await seedRole(role.name);

  auditLog({
    entityType: "System",
    entityId: roleId,
    userId: session!.user!.id!,
    action: "role_reset_to_defaults",
    newValue: `${count} permissions reseeded`,
  });

  invalidateRbacCache();

  return Response.json({ ok: true, role: role.name, count });
}
