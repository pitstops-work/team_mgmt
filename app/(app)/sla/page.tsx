import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import SlaView, { type SlaItem, type SlaStatus } from "./SlaView";

export const metadata = { title: "SLA Compliance" };

export default async function SlaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const now = new Date();

  // Fetch all checklist items where the parent pitstop has a target date (= SLA deadline)
  const rawItems = await prisma.checklistItem.findMany({
    where: {
      pitstop: {
        deletedAt: null,
        targetDate: { not: null },
        goal: { deletedAt: null },
      },
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true, designation: true } },
      pitstop: {
        select: {
          ownerId: true,
          owner: { select: { id: true, name: true, designation: true } },
          targetDate: true,
          // Full geography chain from each scoping level
          needsSettlement: {
            select: {
              id: true, name: true,
              cluster: {
                select: {
                  id: true, name: true,
                  zone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } },
                },
              },
            },
          },
          needsCluster: {
            select: {
              id: true, name: true,
              zone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } },
            },
          },
          needsZone: {
            select: { id: true, name: true, city: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  const items: SlaItem[] = rawItems.map(ci => {
    const deadline = ci.pitstop.targetDate!;

    // SLA status
    let slaStatus: SlaStatus;
    if (ci.status === "Done") {
      slaStatus = ci.completedAt && ci.completedAt <= deadline ? "within" : "late";
    } else {
      slaStatus = deadline < now ? "overdue" : "ontrack";
    }

    // Person: assignee takes priority over pitstop owner
    const person = ci.assignee ?? ci.pitstop.owner;

    // Resolve geography chain from most specific to least specific
    let geo: SlaItem["geo"] = { settlement: null, cluster: null, zone: null, city: null };
    const p = ci.pitstop;
    if (p.needsSettlement) {
      geo = {
        settlement: { id: p.needsSettlement.id, name: p.needsSettlement.name },
        cluster:    p.needsSettlement.cluster
          ? { id: p.needsSettlement.cluster.id, name: p.needsSettlement.cluster.name }
          : null,
        zone:  p.needsSettlement.cluster?.zone
          ? { id: p.needsSettlement.cluster.zone.id, name: p.needsSettlement.cluster.zone.name }
          : null,
        city:  p.needsSettlement.cluster?.zone?.city ?? null,
      };
    } else if (p.needsCluster) {
      geo = {
        settlement: null,
        cluster: { id: p.needsCluster.id, name: p.needsCluster.name },
        zone:    p.needsCluster.zone
          ? { id: p.needsCluster.zone.id, name: p.needsCluster.zone.name }
          : null,
        city:    p.needsCluster.zone?.city ?? null,
      };
    } else if (p.needsZone) {
      geo = {
        settlement: null,
        cluster:    null,
        zone: { id: p.needsZone.id, name: p.needsZone.name },
        city: p.needsZone.city ?? null,
      };
    }

    return { id: ci.id, slaStatus, person, geo };
  });

  return (
    <div className="flex flex-col min-h-full bg-white">
      <div className="px-5 sm:px-8 pt-6 pb-5 border-b border-stone-100">
        <h1 className="text-xl font-semibold text-stone-900">SLA Compliance</h1>
        <p className="text-sm text-stone-400 mt-0.5">
          Checklist items vs pitstop target date — by person and geography
        </p>
      </div>
      <div className="flex-1 px-5 sm:px-8 py-6 pb-24 sm:pb-8 max-w-5xl">
        <SlaView items={items} />
      </div>
    </div>
  );
}
