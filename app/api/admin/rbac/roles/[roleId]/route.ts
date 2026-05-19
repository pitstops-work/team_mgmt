import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/roleGuard";
import { auditLog } from "@/lib/auditLog";
import { invalidateRbacCache } from "@/lib/rbac";
import { SCOPE_KINDS, RESOURCE_ACTIONS, SCOPE_LABELS } from "@/lib/rbacSeed";

const VALID_KINDS = new Set<string>(SCOPE_KINDS);

// GET /api/admin/rbac/roles/[roleId]
// Returns role details + every permission in the catalog with its current scope
// for this role (or null if the role doesn't have the permission).
export async function GET(_req: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { roleId } = await params;
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return Response.json({ error: "Not found" }, { status: 404 });

  const [permissions, rolePermissions] = await Promise.all([
    prisma.permission.findMany({ orderBy: [{ resource: "asc" }, { action: "asc" }] }),
    prisma.rolePermission.findMany({ where: { roleId } }),
  ]);

  const grantByPermId = new Map(rolePermissions.map((rp) => [rp.permissionId, rp.scopeRule]));

  // Group permissions by resource for UI consumption
  type Row = {
    permissionId: string;
    resource: string;
    action: string;
    granted: boolean;
    scopeRule: unknown;
  };
  const grouped: Record<string, Row[]> = {};
  for (const p of permissions) {
    const row: Row = {
      permissionId: p.id,
      resource: p.resource,
      action: p.action,
      granted: grantByPermId.has(p.id),
      scopeRule: grantByPermId.get(p.id) ?? null,
    };
    (grouped[p.resource] ??= []).push(row);
  }

  // Stable resource order matches the seed catalog
  const resourceOrder = Object.keys(RESOURCE_ACTIONS);
  const groups = resourceOrder
    .filter((r) => grouped[r])
    .map((r) => ({ resource: r, permissions: grouped[r] }));

  return Response.json({
    role: { id: role.id, name: role.name, description: role.description, isSystem: role.isSystem },
    groups,
    scopeKinds: SCOPE_KINDS,
    scopeLabels: SCOPE_LABELS,
  });
}

// PATCH /api/admin/rbac/roles/[roleId]
// Body: { updates: [{ permissionId, granted: boolean, scopeRule?: { kind } }] }
// For each update: if granted=true, upsert the RolePermission with scopeRule;
// if granted=false, delete it.
export async function PATCH(req: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const session = await auth();
  if (!isSuperAdmin(session)) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { roleId } = await params;
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null) as { updates?: Array<{ permissionId: string; granted: boolean; scopeRule?: { kind: string } }> } | null;
  if (!body || !Array.isArray(body.updates)) {
    return Response.json({ error: "Body must be { updates: [...] }" }, { status: 400 });
  }

  // Validate scope kinds before doing any DB work
  for (const u of body.updates) {
    if (u.granted) {
      const kind = u.scopeRule?.kind;
      if (!kind || !VALID_KINDS.has(kind)) {
        return Response.json({ error: `Invalid scope kind: ${kind ?? "(missing)"}` }, { status: 400 });
      }
    }
  }

  // Snapshot the BEFORE state for audit logging
  const before = await prisma.rolePermission.findMany({
    where: { roleId, permissionId: { in: body.updates.map((u) => u.permissionId) } },
    include: { permission: true },
  });
  const beforeByPerm = new Map(before.map((rp) => [rp.permissionId, rp]));

  // Apply each update
  for (const u of body.updates) {
    if (u.granted) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: u.permissionId } },
        create: { roleId, permissionId: u.permissionId, scopeRule: u.scopeRule! },
        update: { scopeRule: u.scopeRule! },
      });
    } else {
      await prisma.rolePermission.deleteMany({ where: { roleId, permissionId: u.permissionId } });
    }
  }

  // Audit each change individually so the log captures field-level deltas
  const actorId = session!.user!.id!;
  for (const u of body.updates) {
    const prev = beforeByPerm.get(u.permissionId);
    const prevGranted = !!prev;
    const prevScope = prev ? JSON.stringify(prev.scopeRule) : null;
    const nextScope = u.granted ? JSON.stringify(u.scopeRule) : null;
    if (prevGranted !== u.granted || prevScope !== nextScope) {
      auditLog({
        entityType: "System",
        entityId: roleId,
        userId: actorId,
        action: "role_permission_change",
        field: prev ? `${prev.permission.resource}.${prev.permission.action}` : u.permissionId,
        oldValue: prevGranted ? `granted: ${prevScope}` : "not granted",
        newValue: u.granted ? `granted: ${nextScope}` : "not granted",
      });
    }
  }

  invalidateRbacCache();

  return Response.json({ ok: true, applied: body.updates.length });
}
