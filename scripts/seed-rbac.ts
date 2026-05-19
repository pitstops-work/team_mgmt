/**
 * Seeds the RBAC catalog (roles, permissions, role permissions) per
 * docs/rbac-catalog.md. Idempotent — safe to re-run.
 *
 * The grants live in lib/rbacSeed.ts (shared with the admin UI's
 * "reset to defaults" endpoint). This file is just the CLI entry point.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/seed-rbac.ts
 */

import prisma from "../lib/prisma";
import { seedPermissions, seedAllRoles, ROLES_CONFIG } from "../lib/rbacSeed";

async function main() {
  console.log("[rbac-seed] starting…");

  const permCount = await seedPermissions();
  console.log(`[rbac-seed] permissions: ${permCount} ensured`);

  console.log(`[rbac-seed] roles: ${ROLES_CONFIG.length} ensured`);

  const counts = await seedAllRoles();
  let total = 0;
  for (const [name, n] of Object.entries(counts)) {
    console.log(`[rbac-seed] role ${name}: ${n} permissions`);
    total += n;
  }
  console.log(`[rbac-seed] total grants: ${total}`);
  console.log("[rbac-seed] done.");
}

main()
  .catch((err) => {
    console.error("[rbac-seed] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
