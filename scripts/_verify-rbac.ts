/**
 * Smoke-test for the RBAC helpers. Constructs a fake context for each system
 * role and prints what scopeWhere() would produce for representative
 * (resource, action) pairs.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/_verify-rbac.ts
 */

import prisma from "../lib/prisma";
import { can, scopeWhere, type RbacContext } from "../lib/rbac";

const ROLES = ["super-admin", "admin", "member", "viewer", "budget-admin"] as const;
const CHECKS: Array<{ resource: string; action: string }> = [
  { resource: "goal", action: "list" },
  { resource: "goal", action: "read" },
  { resource: "pitstop", action: "list" },
  { resource: "pitstop_event", action: "list" },
  { resource: "thread", action: "list" },
  { resource: "programme_journey", action: "list" },
  { resource: "notification", action: "list" },
  { resource: "user", action: "list" },
  { resource: "settlement", action: "create" },
  { resource: "review_portal", action: "access" },
];

async function main() {
  // Find one real user we can use to test getTeamIds (recursive CTE)
  const user = await prisma.user.findFirst({
    where: { reports: { some: {} } }, // someone who has at least one report
    select: { id: true, name: true, designation: true, cityId: true },
  });

  console.log("\n=== RBAC verification ===\n");
  console.log(`Test user for team expansion: ${user?.name ?? "(none with reports)"} (${user?.designation ?? "—"})\n`);

  for (const role of ROLES) {
    const ctx: RbacContext = {
      userId: user?.id ?? "fake-user-id",
      role,
      designation: user?.designation ?? "Other",
      cityId: user?.cityId ?? null,
    };
    console.log(`── role: ${role} ──────────────────────────`);
    for (const check of CHECKS) {
      const allowed = await can(ctx, check.resource, check.action);
      const key = `${check.resource}.${check.action}`.padEnd(28);
      if (!allowed) {
        console.log(`  ${key} : (no permission)`);
        continue;
      }
      try {
        const where = await scopeWhere(ctx, check.resource, check.action);
        const summary = JSON.stringify(where);
        console.log(`  ${key} : ${summary.length > 80 ? summary.slice(0, 77) + "..." : summary}`);
      } catch (err) {
        console.log(`  ${key} : ERROR (${(err as Error).message})`);
      }
    }
    console.log();
  }

  console.log("=== end ===\n");
}

main()
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
