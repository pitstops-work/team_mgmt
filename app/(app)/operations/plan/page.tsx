import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import prisma from "@/lib/prisma";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { VisitsPlanner } from "@/app/(app)/visits/VisitsPlanner";

export const dynamic = "force-dynamic";

/**
 * Month-end planner — "plan your month". Reuses the /visits month grid opened
 * on next month, pre-filled with next month's scheduled work (setup activities
 * carry dates from template-apply; recurring visits are pre-materialised by the
 * materialize-next-month cron). Drag a card to a day → the existing reschedule
 * endpoint moves the visit + its activities.
 */
export default async function OperationsPlanPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, designation: true },
  });
  if (!me) redirect("/login");

  return (
    <SurfaceProvider id="operations.month_planner">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 py-4">
        <Link href="/operations" className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 mb-2">
          <ChevronLeft className="w-3.5 h-3.5" /> Operations
        </Link>
        <h1 className="text-lg font-semibold text-stone-900 mb-1">Plan your month</h1>
        <p className="text-sm text-stone-500 mb-4">Drag each visit onto the day you&apos;ll do it.</p>
        <VisitsPlanner
          currentUserId={me.id}
          currentUserDesignation={me.designation ?? "Other"}
          initialMonthOffset={1}
        />
      </div>
    </SurfaceProvider>
  );
}
