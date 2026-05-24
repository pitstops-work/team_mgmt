// Wiki module seed — idempotent.
//
// Run with: npx tsx prisma/seed-wiki.ts
//
// Steps:
//   1. Create "Pitstops Internal" Org if missing
//   2. Backfill User.orgId for any users still null
//   3. Insert wiki.* Permission rows (resource=wiki, action=read|comment|flag)
//   4. Grant baseline (read/comment/flag) to every existing Role with scope=all
//
// Steward and curator powers are NOT seeded here — they're gated via WikiStaff
// rows, populated separately as humans get assigned.

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const INTERNAL_ORG_SLUG = "pitstops-internal";
const WIKI_BASE_ACTIONS = ["read", "comment", "flag"] as const;

async function main() {
  // 1. Internal org
  const org = await prisma.org.upsert({
    where: { slug: INTERNAL_ORG_SLUG },
    update: {},
    create: {
      name: "Pitstops Internal",
      slug: INTERNAL_ORG_SLUG,
      kind: "internal",
    },
  });
  console.log(`Org ready: ${org.name} (${org.id})`);

  // 2. Backfill users
  const backfilled = await prisma.user.updateMany({
    where: { orgId: null },
    data: { orgId: org.id },
  });
  console.log(`Backfilled ${backfilled.count} user(s) to internal org`);

  // 3. Permissions
  for (const action of WIKI_BASE_ACTIONS) {
    await prisma.permission.upsert({
      where: { resource_action: { resource: "wiki", action } },
      update: {},
      create: { resource: "wiki", action },
    });
  }
  const wikiPerms = await prisma.permission.findMany({
    where: { resource: "wiki", action: { in: [...WIKI_BASE_ACTIONS] } },
  });
  console.log(`Wiki permissions present: ${wikiPerms.map((p) => p.action).join(", ")}`);

  // 4. Grant to every existing role with scope=all
  const roles = await prisma.role.findMany();
  for (const role of roles) {
    for (const perm of wikiPerms) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: perm.id },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: perm.id,
          scopeRule: { kind: "all" },
        },
      });
    }
  }
  console.log(`Granted wiki base permissions to ${roles.length} role(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
