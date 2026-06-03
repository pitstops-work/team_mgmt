/**
 * Designation-anchored visibility set for picker UIs ("users I can pull a
 * schedule / plan / dashboard for"). Distinct from `lib/rbac.ts:getTeamIds`
 * which is always recursive — this helper honours the one-hop convention
 * for ZL/PM, matching how those designations operate in the field.
 *
 *   RP            → {self}                     (no one else's calendar)
 *   ZL / PM       → {self} ∪ direct reports    (one hop down only)
 *   Leader        → recursive descendants      (self + all transitive reports)
 *   admin / super-admin → recursive            (treat as apex Leader)
 *   Other         → {self}                     (no team visibility by default)
 *
 * Standalone (not exported from rbac.ts) so it can ship without touching the
 * in-flight surface-header RBAC refactor on lib/rbac.ts. When that refactor
 * lands, this helper can be folded back into lib/rbac.ts at the caller's
 * convenience.
 */

import prisma from "./prisma";
import { getTeamIds } from "./rbac";

type RbacContextLite = {
  userId: string;
  role: string;
  designation: string;
};

export async function getVisibleUserIds(ctx: RbacContextLite): Promise<string[]> {
  const role = ctx.role;
  const d = ctx.designation;
  // Apex roles get the full recursive tree (admin/super-admin treated as Leader).
  if (role === "admin" || role === "super-admin" || d === "Leader") {
    return getTeamIds(ctx.userId);
  }
  if (d === "ZL" || d === "PM") {
    const reports = await prisma.user.findMany({
      where: { reportsToId: ctx.userId },
      select: { id: true },
    });
    return [ctx.userId, ...reports.map(r => r.id)];
  }
  // RP / Other — self only.
  return [ctx.userId];
}
