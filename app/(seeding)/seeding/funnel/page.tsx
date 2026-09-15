import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess, canEditFunnelGeo } from "@/lib/seeding/access";
import { computeTargets } from "@/lib/seeding/funnel";
import { ACTIVE_STAGES } from "@/lib/seeding/outreach";
import type { SeedingChannelStage, SeedingSessionStatus } from "@/app/generated/prisma/client";
import FunnelEditor from "./FunnelEditor";

export default async function FunnelPage() {
  const session = await auth();
  const access = await getSeedingAccess(session);

  const [config, geos, channelGroups, sessionGroups, heldSums] = await Promise.all([
    prisma.seedingFunnelConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" }, include: { funnel: true } }),
    // Channel + session counts are read-time: they only appear on this page, so
    // they don't justify a materialised column the way reach/leads do.
    prisma.seedingChannel.groupBy({ by: ["geoId", "stage"], where: { archivedAt: null }, _count: true }),
    prisma.seedingSession.groupBy({ by: ["geoId", "status"], where: { archivedAt: null }, _count: true }),
    prisma.seedingSession.groupBy({
      by: ["geoId"],
      where: { archivedAt: null, status: "held" },
      _sum: { reachCount: true, leadsCaptured: true },
    }),
  ]);
  if (!config) return <div className="text-sm text-stone-400">Funnel not initialised.</div>;

  const targets = computeTargets(config, geos.length);

  // Bucket by geo id, with "central" holding the null-geo rows.
  const CENTRAL = "central";
  const stageCounts = new Map<string, Partial<Record<SeedingChannelStage, number>>>();
  for (const row of channelGroups) {
    const key = row.geoId ?? CENTRAL;
    const bucket = stageCounts.get(key) ?? {};
    bucket[row.stage] = (bucket[row.stage] ?? 0) + row._count;
    stageCounts.set(key, bucket);
  }
  const statusCounts = new Map<string, Partial<Record<SeedingSessionStatus, number>>>();
  for (const row of sessionGroups) {
    const key = row.geoId ?? CENTRAL;
    const bucket = statusCounts.get(key) ?? {};
    bucket[row.status] = (bucket[row.status] ?? 0) + row._count;
    statusCounts.set(key, bucket);
  }
  const heldByGeo = new Map(
    heldSums.map((r) => [r.geoId ?? CENTRAL, { reach: r._sum.reachCount ?? 0, leads: r._sum.leadsCaptured ?? 0 }]),
  );

  const outreachFor = (key: string) => {
    const s = stageCounts.get(key) ?? {};
    const t = statusCounts.get(key) ?? {};
    const held = heldByGeo.get(key) ?? { reach: 0, leads: 0 };
    return {
      identified: s.identified ?? 0,
      contacted: s.contacted ?? 0,
      responded: s.responded ?? 0,
      agreed: s.agreed ?? 0,
      active: s.active ?? 0,
      dropped: s.dropped ?? 0,
      activeOrAgreed: ACTIVE_STAGES.reduce((n, st) => n + (s[st] ?? 0), 0),
      total: (["identified", "contacted", "responded", "agreed", "active"] as const).reduce((n, st) => n + (s[st] ?? 0), 0),
      planned: t.planned ?? 0,
      held: t.held ?? 0,
      cancelled: t.cancelled ?? 0,
      sessionReach: held.reach,
      sessionLeads: held.leads,
    };
  };

  return (
    <FunnelEditor
      config={config}
      targets={targets}
      canEditConfig={access.isCentral}
      central={outreachFor(CENTRAL)}
      geos={geos.map((g) => ({
        id: g.id,
        key: g.key,
        label: g.label,
        reachToDate: g.funnel?.reachToDate ?? 0,
        leadsToDate: g.funnel?.leadsToDate ?? 0,
        reachOpening: g.funnel?.reachOpening ?? 0,
        leadsOpening: g.funnel?.leadsOpening ?? 0,
        openingNote: g.funnel?.openingNote ?? null,
        rollupAtISO: g.funnel?.rollupAt?.toISOString() ?? null,
        appsReceived: g.funnel?.appsReceived ?? 0,
        screened: g.funnel?.screened ?? 0,
        shortlisted: g.funnel?.shortlisted ?? 0,
        outreach: outreachFor(g.id),
        editable: canEditFunnelGeo(access, g.id),
      }))}
    />
  );
}
