/**
 * Seeds (resets to code defaults) a SINGLE role, leaving every other role's
 * permissions untouched. Use this to add a newly-added role — e.g. "partner" —
 * without clobbering any /settings/roles customizations on the other roles.
 *
 * Note: this DOES reset the named role to its code default. If you'd customized
 * that specific role in the UI, those edits are replaced.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/seed-role.ts partner
 */

import prisma from "../lib/prisma";
import { seedPermissions, seedRole, ROLES_CONFIG } from "../lib/rbacSeed";

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error(`[seed-role] usage: tsx scripts/seed-role.ts <role>\n[seed-role] known roles: ${ROLES_CONFIG.map(r => r.name).join(", ")}`);
    process.exit(1);
  }
  if (!ROLES_CONFIG.some(r => r.name === name)) {
    console.error(`[seed-role] unknown role "${name}". Known: ${ROLES_CONFIG.map(r => r.name).join(", ")}`);
    process.exit(1);
  }

  // Additive only — ensures any permission keys the role needs exist.
  const permCount = await seedPermissions();
  console.log(`[seed-role] permissions: ${permCount} ensured`);

  const n = await seedRole(name);
  console.log(`[seed-role] role ${name}: ${n} permissions set`);
  console.log("[seed-role] done.");
}

main()
  .catch((err) => {
    console.error("[seed-role] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
