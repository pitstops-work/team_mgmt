import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";

// GET /api/admin/rbac/roles — list system roles with permission counts.
export async function GET() {
  const session = await auth();
  if (!isSuperAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const roles = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { permissions: true } } },
  });

  return Response.json(
    roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissionCount: r._count.permissions,
      updatedAt: r.updatedAt,
    })),
  );
}
