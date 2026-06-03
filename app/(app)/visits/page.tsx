import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { VisitsPlanner } from "./VisitsPlanner";

export const dynamic = "force-dynamic";

/**
 * Monthly visit planner. Renders the caller's (or their team's, for ZL/PM/
 * Leader) upcoming pitstop visits as draggable cards on a month grid. Drop
 * a card on a different day → PATCH /api/pitstops/[id]/reschedule, which
 * shifts the pitstop window and every non-Done activity by the same delta.
 *
 * Intended primarily for RPs covering many sites (e.g. Abdul + 21 creches),
 * but works for any RP / supervisor who wants the month-at-a-glance view.
 * The existing /planner page is a separate quarterly PlanItem view.
 */
export default async function VisitsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, designation: true },
  });
  if (!me) redirect("/login");

  return (
    <VisitsPlanner
      currentUserId={me.id}
      currentUserDesignation={me.designation ?? "Other"}
    />
  );
}
