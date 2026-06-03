/**
 * Additive RBAC seed — inserts the new `role.*` and `wiki_staff.*` permissions
 * and grants them to the right roles without wiping existing RolePermission rows.
 *
 * Run once after pulling the surfaces RBAC change:
 *   npx tsx scripts/add-rbac-roles-wiki-staff.ts
 *
 * Safe to re-run; uses upsert for both Permission and RolePermission rows.
 */

import prisma from "../lib/prisma";
import { invalidateRbacCache } from "../lib/rbac";

type NewPerm = { resource: string; action: string };

const NEW_PERMISSIONS: NewPerm[] = [
  { resource: "role",       action: "list"   },
  { resource: "role",       action: "read"   },
  { resource: "role",       action: "update" },
  { resource: "wiki_staff", action: "list"   },
  { resource: "wiki_staff", action: "manage" },
];

const SUPER_ADMIN_KEYS = [
  "role.list", "role.read", "role.update",
  "wiki_staff.list", "wiki_staff.manage",
];

// Admin gets wiki_staff but NOT role.* (role catalog is super-admin-only).
const ADMIN_KEYS = [
  "wiki_staff.list", "wiki_staff.manage",
];

async function main() {
  // 1. Upsert Permission rows
  let added = 0;
  for (const p of NEW_PERMISSIONS) {
    const before = await prisma.permission.findUnique({
      where: { resource_action: { resource: p.resource, action: p.action } },
    });
    await prisma.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      create: p,
      update: {},
    });
    if (!before) added++;
  }
  console.log(`✓ Permissions: ${added} new, ${NEW_PERMISSIONS.length - added} already existed`);

  // 2. Grant to roles via upsert (preserves any existing scope on these keys)
  const allPerms = await prisma.permission.findMany({
    where: { OR: NEW_PERMISSIONS.map((p) => ({ resource: p.resource, action: p.action })) },
  });
  const permByKey = new Map(allPerms.map((p) => [`${p.resource}.${p.action}`, p.id]));

  async function grant(roleName: string, keys: string[]) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      console.log(`  · skipping ${roleName} (role doesn't exist)`);
      return 0;
    }
    let n = 0;
    for (const key of keys) {
      const permissionId = permByKey.get(key);
      if (!permissionId) continue;
      const before = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
      });
      if (before) continue; // don't override existing scope edits
      await prisma.rolePermission.create({
        data: { roleId: role.id, permissionId, scopeRule: { kind: "all" } },
      });
      n++;
    }
    return n;
  }

  const superAdded = await grant("super-admin", SUPER_ADMIN_KEYS);
  console.log(`✓ super-admin: ${superAdded} new grants`);

  const adminAdded = await grant("admin", ADMIN_KEYS);
  console.log(`✓ admin:       ${adminAdded} new grants`);

  invalidateRbacCache();
  console.log("\nDone. Re-seeded RBAC cache cleared.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
