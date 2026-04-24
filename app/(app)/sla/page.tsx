import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isAdminUser, isSuperAdmin } from "@/lib/roleGuard";
import prisma from "@/lib/prisma";
import SlaView, { type SlaItem, type SlaStatus } from "./SlaView";

export const metadata = { title: "SLA Compliance" };

export default async function SlaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isAdminUser(session)) redirect("/home");

  const superAdmin = isSuperAdmin(session);
  const now = new Date();

  // For regular admin, get their assigned city to scope the data
  let adminCityId: string | null = null;
  if (!superAdmin) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id! },
      select: { cityId: true },
    });
    adminCityId = me?.cityId ?? null;
  }

  // City filter: null = no restriction (super admin), string = restrict to that city
  const cityFilter = adminCityId
    ? {
        OR: [
          { needsZone:       { cityId: adminCityId } },
          { needsCluster:    { zone: { cityId: adminCityId } } },
          { needsSettlement: { cluster: { zone: { cityId: adminCityId } } } },
        ],
      }
    : {};

  const rawItems = await prisma.checklistItem.findMany({
    where: {
      pitstop: {
        deletedAt: null,
        targetDate: { not: null },
        goal: { deletedAt: null },
        ...cityFilter,
      },
    },
    select: {
      id: true,
      text: true,
      status: true,
      completedAt: true,
      assigneeId: true,
      assignee: { select: { id: true, name: true, designation: true } },
      pitstop: {
        select: {
          id: true,
          title: true,
          ownerId: true,
          owner: {
            select: {
              id: true, name: true, designation: true,
              city: { select: { id: true, name: true } },
            },
          },
          targetDate: true,
          goal: {
            select: {
              id: true, title: true,
              needsCity: { select: { id: true, name: true } },
              needsZone: { select: { id: true, name: true, city: { select: { id: true, name: true } } } },
            },
          },
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

    let slaStatus: SlaStatus;
    if (ci.status === "Done") {
      slaStatus = ci.completedAt && ci.completedAt <= deadline ? "within" : "late";
    } else {
      slaStatus = deadline < now ? "overdue" : "ontrack";
    }

    const daysOverdue = slaStatus === "overdue"
      ? Math.floor((now.getTime() - new Date(deadline).getTime()) / 86400000)
      : slaStatus === "late" && ci.completedAt
        ? Math.floor((new Date(ci.completedAt).getTime() - new Date(deadline).getTime()) / 86400000)
        : 0;

    const person = ci.assignee ?? (ci.pitstop.owner
      ? { id: ci.pitstop.owner.id, name: ci.pitstop.owner.name, designation: ci.pitstop.owner.designation }
      : null);

    let geo: SlaItem["geo"] = { settlement: null, cluster: null, zone: null, city: null };
    const p = ci.pitstop;
    if (p.needsSettlement) {
      geo = {
        settlement: { id: p.needsSettlement.id, name: p.needsSettlement.name },
        cluster: p.needsSettlement.cluster
          ? { id: p.needsSettlement.cluster.id, name: p.needsSettlement.cluster.name }
          : null,
        zone: p.needsSettlement.cluster?.zone
          ? { id: p.needsSettlement.cluster.zone.id, name: p.needsSettlement.cluster.zone.name }
          : null,
        city: p.needsSettlement.cluster?.zone?.city ?? null,
      };
    } else if (p.needsCluster) {
      geo = {
        settlement: null,
        cluster: { id: p.needsCluster.id, name: p.needsCluster.name },
        zone: p.needsCluster.zone
          ? { id: p.needsCluster.zone.id, name: p.needsCluster.zone.name }
          : null,
        city: p.needsCluster.zone?.city ?? null,
      };
    } else if (p.needsZone) {
      geo = {
        settlement: null,
        cluster: null,
        zone: { id: p.needsZone.id, name: p.needsZone.name },
        city: p.needsZone.city ?? null,
      };
    } else if (p.owner?.city) {
      geo = { settlement: null, cluster: null, zone: null, city: p.owner.city };
    } else if (p.goal.needsCity) {
      geo = { settlement: null, cluster: null, zone: null, city: p.goal.needsCity };
    } else if (p.goal.needsZone?.city) {
      geo = { settlement: null, cluster: null, zone: { id: p.goal.needsZone.id, name: p.goal.needsZone.name }, city: p.goal.needsZone.city };
    }

    return {
      id: ci.id,
      text: ci.text,
      slaStatus,
      daysOverdue,
      goal: { id: p.goal.id, title: p.goal.title ?? "" },
      pitstop: { id: p.id, title: p.title, targetDate: deadline.toISOString() },
      person,
      geo,
    };
  });

  // Admin with no city assigned → warn rather than show empty data
  const cityName = adminCityId
    ? (items[0]?.geo.city?.name ?? null)
    : null;

  return (
    <div className="flex flex-col min-h-full bg-white">
      <div className="px-5 sm:px-8 pt-6 pb-5 border-b border-stone-100">
        <h1 className="text-xl font-semibold text-stone-900">SLA Compliance</h1>
        <p className="text-sm text-stone-400 mt-0.5">
          {superAdmin
            ? "All cities — checklist items vs pitstop target date"
            : cityName
              ? `${cityName} — checklist items vs pitstop target date`
              : "Checklist items vs pitstop target date"}
        </p>
        {!superAdmin && !adminCityId && (
          <p className="mt-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-block">
            No city assigned to your account. Ask a super-admin to set your city in user settings.
          </p>
        )}
      </div>
      <div className="flex-1 px-5 sm:px-8 py-6 pb-24 sm:pb-8 max-w-5xl">
        <SlaView items={items} showCityFilter={superAdmin} />
      </div>
    </div>
  );
}
