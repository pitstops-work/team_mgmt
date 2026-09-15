// Materialised outreach rollups. Same pattern as recomputeTaskRollup() in
// app/(seeding)/seeding/actions.ts: the funnel's reach/lead actuals are DERIVED
// from the outreach log, but written back onto SeedingFunnelGeo so the four
// pages that already `include: { funnel: true }` need no extra query.
//
// Every write path that touches a session or a channel must call these before
// revalidating. recomputeAllOutreachRollups() is the escape hatch if anything
// is ever edited outside those paths (it is wired to a Recompute link on the
// funnel page, central only).

import prisma from "@/lib/prisma";
import { ACTIVE_STAGES } from "./outreach";

/** Recompute one channel's own counters from its held sessions. */
export async function recomputeChannelRollup(channelId: string): Promise<void> {
  const [agg, last] = await Promise.all([
    prisma.seedingSession.aggregate({
      where: { channelId, status: "held", archivedAt: null },
      _count: true,
      _sum: { reachCount: true, leadsCaptured: true },
    }),
    prisma.seedingSession.findFirst({
      where: { channelId, status: "held", archivedAt: null },
      orderBy: { heldAt: "desc" },
      select: { heldAt: true },
    }),
  ]);
  await prisma.seedingChannel.update({
    where: { id: channelId },
    data: {
      sessionsHeld: agg._count,
      reachToDate: agg._sum.reachCount ?? 0,
      leadsToDate: agg._sum.leadsCaptured ?? 0,
      lastActivityAt: last?.heldAt ?? null,
    },
  });
}

/**
 * Recompute a geo's funnel actuals. Null geoId (central/national outreach) has
 * no SeedingFunnelGeo row by design — it rolls into the totals on the funnel
 * page, never into a geo row — so this no-ops for it.
 */
export async function recomputeOutreachRollup(geoId: string | null): Promise<void> {
  if (!geoId) return;

  const [existing, held, planned, channels] = await Promise.all([
    prisma.seedingFunnelGeo.findUnique({
      where: { geoId },
      select: { reachOpening: true, leadsOpening: true },
    }),
    prisma.seedingSession.aggregate({
      where: { geoId, status: "held", archivedAt: null },
      _count: true,
      _sum: { reachCount: true, leadsCaptured: true },
    }),
    prisma.seedingSession.count({ where: { geoId, status: "planned", archivedAt: null } }),
    prisma.seedingChannel.groupBy({
      by: ["stage"],
      where: { geoId, archivedAt: null },
      _count: true,
    }),
  ]);

  const reachOpening = existing?.reachOpening ?? 0;
  const leadsOpening = existing?.leadsOpening ?? 0;
  const channelsActive = channels
    .filter((c) => ACTIVE_STAGES.includes(c.stage))
    .reduce((s, c) => s + c._count, 0);
  const channelsTotal = channels
    .filter((c) => c.stage !== "dropped")
    .reduce((s, c) => s + c._count, 0);

  const data = {
    reachToDate: reachOpening + (held._sum.reachCount ?? 0),
    leadsToDate: leadsOpening + (held._sum.leadsCaptured ?? 0),
    sessionsHeld: held._count,
    sessionsPlanned: planned,
    channelsActive,
    channelsTotal,
    rollupAt: new Date(),
  };

  // upsert, not update — a geo may not have a funnel row yet.
  await prisma.seedingFunnelGeo.upsert({
    where: { geoId },
    create: { geoId, ...data },
    update: data,
  });
}

/** Repair path: recompute every channel and every geo. Central only. */
export async function recomputeAllOutreachRollups(): Promise<{ channels: number; geos: number }> {
  const [channels, geos] = await Promise.all([
    prisma.seedingChannel.findMany({ select: { id: true } }),
    prisma.seedingGeo.findMany({ select: { id: true } }),
  ]);
  for (const c of channels) await recomputeChannelRollup(c.id);
  for (const g of geos) await recomputeOutreachRollup(g.id);
  return { channels: channels.length, geos: geos.length };
}
