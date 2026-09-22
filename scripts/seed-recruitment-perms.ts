/**
 * Seed the `recruitment.*` permissions into the DB and grant them to
 * super-admin. Idempotent — safe to re-run.
 *
 * 2026-09-22: `update` was missing from this list, so the Permission row never
 * existed and `can(ctx, "recruitment", "update")` returned false for EVERY
 * role. That silently killed JD + location editing — the Save button is hidden
 * in JobEditor/LocationsClient and both PUT routes 404. Adding it here also
 * back-fills the grant onto any role that already holds `recruitment.create`,
 * since "can create a JD but not edit it" is the broken state being fixed, not
 * a deliberate restriction.
 *
 * Written as a targeted script (NOT scripts/seed-role.ts / seedRole()) because
 * per [[rbac_system]], seedRole() deletes+recreates all of a role's grants,
 * which would drop anything an admin edited via /settings/roles. This script
 * only upserts the recruitment Permission rows and the matching
 * RolePermission rows — nothing else in the RBAC catalog is touched.
 *
 * Run:   pnpm tsx scripts/seed-recruitment-perms.ts
 *
 * .env.local == prod DB — running locally hits prod. That's intentional here.
 * After running, the in-process rbac cache on running Vercel instances is
 * stale for up to 60s (ROLE_PERMS_TTL_MS). Wait a minute, or bounce the
 * deployment (redeploy same commit) if you want it live immediately.
 */

// `dotenv/config` reads .env, which has no DATABASE_URL here — the creds live
// in .env.local (== prod, per [[local_prod_shared_db]]). Load that explicitly.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const RECRUITMENT_ACTIONS = ["list", "read", "create", "update", "delete"] as const;

async function main() {
  const { default: prisma } = await import("../lib/prisma");

  // 1. Upsert the four Permission catalog rows.
  const perms = await Promise.all(
    RECRUITMENT_ACTIONS.map((action) =>
      prisma.permission.upsert({
        where: { resource_action: { resource: "recruitment", action } },
        create: { resource: "recruitment", action },
        update: {},
      }),
    ),
  );
  console.log(`[seed-recruitment-perms] ${perms.length} Permission rows ensured.`);

  // 2. Grant to super-admin. Never touch admin/member/viewer/etc. — the
  // recruitment resource is opt-in per role via /settings/roles.
  const superAdmin = await prisma.role.findUnique({ where: { name: "super-admin" } });
  if (!superAdmin) {
    throw new Error("super-admin role not found — bootstrap RBAC first (scripts/seed-role.ts super-admin).");
  }

  let created = 0;
  let alreadyThere = 0;
  for (const p of perms) {
    const existing = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId: superAdmin.id, permissionId: p.id } },
    });
    if (existing) {
      alreadyThere++;
      continue;
    }
    await prisma.rolePermission.create({
      data: {
        roleId: superAdmin.id,
        permissionId: p.id,
        scopeRule: { kind: "all" },
      },
    });
    created++;
  }

  console.log(`[seed-recruitment-perms] super-admin grants: ${created} added, ${alreadyThere} already present.`);

  // 3. Back-fill `update` onto any OTHER role that already holds
  // `recruitment.create`. Those roles were given editorial rights via
  // /settings/roles and only lack `update` because the row never existed.
  // Mirrors each role's own create-scope rather than assuming { kind: "all" }.
  const updatePerm = perms.find((p) => p.action === "update")!;
  const createPerm = perms.find((p) => p.action === "create")!;
  const createHolders = await prisma.rolePermission.findMany({
    where: { permissionId: createPerm.id, roleId: { not: superAdmin.id } },
    include: { role: true },
  });
  for (const holder of createHolders) {
    const existing = await prisma.rolePermission.findUnique({
      where: { roleId_permissionId: { roleId: holder.roleId, permissionId: updatePerm.id } },
    });
    if (existing) {
      console.log(`[seed-recruitment-perms] ${holder.role.name}: recruitment.update already present.`);
      continue;
    }
    await prisma.rolePermission.create({
      data: { roleId: holder.roleId, permissionId: updatePerm.id, scopeRule: holder.scopeRule ?? { kind: "all" } },
    });
    console.log(`[seed-recruitment-perms] ${holder.role.name}: recruitment.update granted (mirrors its recruitment.create scope).`);
  }

  console.log(`[seed-recruitment-perms] Cache TTL is 60s — grants may take up to a minute to go live on hot instances.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(async () => {
    const { default: prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
