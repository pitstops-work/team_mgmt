/**
 * Read-only diagnostic for: leader can't see Abdul's APs in Follow-ups.
 *
 * Checks:
 *   1. Abdul → Shrinivas → leader chain via reportsToId.
 *   2. Whether Abdul's userId is in the leader's recursive teamIds.
 *   3. Count of APs owned/created by Abdul (any status + filtered to "open").
 *   4. Whether the leader's role has action_point.list at TEAM scope.
 *   5. Sample of what the team-scoped query would return for the leader.
 *
 * Usage: npx tsx scripts/_inspect-abdul-followups.ts
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const LEADER_EMAIL = "kotlerster@gmail.com";

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { getTeamIds, scopeWhere } = await import("../lib/rbac");

  // Resolve leader + Abdul + Shrinivas. Names are best-effort fuzzy matches.
  const leader = await prisma.user.findFirst({
    where: { email: LEADER_EMAIL },
    select: { id: true, name: true, email: true, designation: true, reportsToId: true, role: true },
  });
  if (!leader) {
    console.log("Leader not found by email:", LEADER_EMAIL);
    return;
  }
  console.log("Leader:", JSON.stringify(leader, null, 2));

  const abdul = await prisma.user.findFirst({
    where: { name: { contains: "Abdul", mode: "insensitive" } },
    select: { id: true, name: true, designation: true, reportsToId: true },
  });
  if (!abdul) {
    console.log("Abdul not found.");
    return;
  }
  console.log("\nAbdul:", JSON.stringify(abdul, null, 2));

  const shrinivas = abdul.reportsToId
    ? await prisma.user.findUnique({
        where: { id: abdul.reportsToId },
        select: { id: true, name: true, designation: true, reportsToId: true },
      })
    : null;
  console.log("\nAbdul.reportsTo (Shrinivas?):", JSON.stringify(shrinivas, null, 2));

  if (shrinivas?.reportsToId) {
    const shrinivasReportsTo = await prisma.user.findUnique({
      where: { id: shrinivas.reportsToId },
      select: { id: true, name: true, email: true, designation: true },
    });
    console.log("\nShrinivas.reportsTo:", JSON.stringify(shrinivasReportsTo, null, 2));
  }

  // 2. teamIds for leader — Abdul should be in here.
  const teamIds = await getTeamIds(leader.id);
  console.log(`\nLeader teamIds count: ${teamIds.length}`);
  console.log("Abdul in leader teamIds:", teamIds.includes(abdul.id));
  console.log("Shrinivas in leader teamIds:", shrinivas ? teamIds.includes(shrinivas.id) : "n/a");

  // 3. APs owned by Abdul
  const abdulApsAll = await prisma.actionPoint.count({ where: { ownerId: abdul.id } });
  const abdulApsOpen = await prisma.actionPoint.count({ where: { ownerId: abdul.id, status: "open" } });
  const abdulApsCreatedBy = await prisma.actionPoint.count({ where: { createdById: abdul.id } });
  console.log(`\nAPs where Abdul is owner: ${abdulApsAll} (open: ${abdulApsOpen})`);
  console.log(`APs where Abdul is creator: ${abdulApsCreatedBy}`);

  // List a few open ones with fields the leader's query would care about
  const sample = await prisma.actionPoint.findMany({
    where: { ownerId: abdul.id, status: "open" },
    select: {
      id: true, title: true, status: true, dueDate: true,
      ownerId: true, createdById: true, pitstopId: true, goalId: true,
    },
    take: 5, orderBy: { createdAt: "desc" },
  });
  console.log(`\nSample open APs from Abdul:`);
  for (const r of sample) console.log(JSON.stringify(r));

  // 4. Role-level: does the leader's role have action_point.list?
  const roleRow = await prisma.role.findUnique({
    where: { name: leader.role },
    select: { id: true, name: true },
  });
  console.log(`\nLeader role row:`, JSON.stringify(roleRow, null, 2));
  if (roleRow) {
    const apListPerm = await prisma.permission.findUnique({
      where: { resource_action: { resource: "action_point", action: "list" } },
      select: { id: true },
    });
    if (apListPerm) {
      const rp = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: roleRow.id, permissionId: apListPerm.id } },
        select: { scopeRule: true },
      });
      console.log(`action_point.list grant for role "${roleRow.name}":`, JSON.stringify(rp, null, 2));
    } else {
      console.log("action_point.list Permission row does NOT exist in DB. Seed not run.");
    }
  }

  // 5. Build the actual team-scoped where the API would use and count rows.
  // Construct a minimal RbacContext shape — scopeWhere reads only userId for
  // action_point team scope (getTeamIds runs from userId).
  type RbacCtxLike = Parameters<typeof scopeWhere>[0];
  const ctx = {
    userId: leader.id,
    role: leader.role,
    designation: leader.designation,
    cityId: null,
    isViewer: false,
  } as unknown as RbacCtxLike;
  const where = await scopeWhere(ctx, "action_point", "list");
  console.log(`\nResolved scopeWhere for leader on action_point.list:`, JSON.stringify(where, null, 2));
  if (where === null) {
    console.log("→ scopeWhere returned null = no permission");
  } else {
    const teamCount = await prisma.actionPoint.count({ where: { ...(where as object), status: "open" } });
    console.log(`Open APs the leader's TEAM scope would return: ${teamCount}`);

    const includesAbdul = await prisma.actionPoint.count({ where: { ...(where as object), status: "open", ownerId: abdul.id } });
    console.log(`Of those, owned by Abdul: ${includesAbdul}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
