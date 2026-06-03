/**
 * Picker options for the /visits user multi-select. Returns the users the
 * caller is permitted to plan-for, per designation rules:
 *
 *   RP                    → {self} only
 *   ZL / PM               → {self} ∪ direct reports
 *   Leader / admin / super → recursive descendants
 *   Other                 → {self}
 *
 * Marked as the same allowed-set the /api/pitstops/planner endpoint validates
 * `userIds` against, so the picker can't display options the server would
 * reject. Self always appears first so the default picker selection is stable.
 */

import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildRbacContext } from "@/lib/rbac";
import { getVisibleUserIds } from "@/lib/visibilityScope";

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ctx = await buildRbacContext(session);
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const ids = await getVisibleUserIds(ctx);
  if (ids.length === 0) return Response.json([], { status: 200 });

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, image: true, designation: true },
  });
  // Sort: self first, then by designation rank (RP > ZL > PM > Leader > Other),
  // then by name. Keeps the picker scannable for ZLs reviewing their RPs.
  const designationRank: Record<string, number> = { RP: 0, ZL: 1, PM: 2, Leader: 3, Other: 4 };
  const sorted = users.slice().sort((a, b) => {
    if (a.id === ctx.userId) return -1;
    if (b.id === ctx.userId) return 1;
    const da = designationRank[a.designation ?? "Other"] ?? 5;
    const db = designationRank[b.designation ?? "Other"] ?? 5;
    if (da !== db) return da - db;
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  return Response.json(sorted);
}
