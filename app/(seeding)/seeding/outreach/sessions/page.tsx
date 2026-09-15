import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess, canEditGeoOutreach } from "@/lib/seeding/access";
import type { SeedingSessionStatus } from "@/app/generated/prisma/client";
import { geoOptions, resolveGeoParam, geoWhere, first } from "../_lib/scope";
import SessionLog from "./SessionLog";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await auth();
  const access = await getSeedingAccess(session);

  const geos = await prisma.seedingGeo.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, key: true, label: true },
  });
  const scope = resolveGeoParam(first(sp.geo), geos);
  const status = first(sp.status) as SeedingSessionStatus | undefined;
  const channelId = first(sp.channel);

  const [sessions, channels, subGeos] = await Promise.all([
    prisma.seedingSession.findMany({
      where: {
        archivedAt: null,
        ...geoWhere(scope),
        ...(status ? { status } : {}),
        ...(channelId ? { channelId } : {}),
      },
      orderBy: [{ scheduledAt: "desc" }],
      take: 300,
      include: {
        channel: { select: { id: true, name: true } },
        subGeo: { select: { label: true } },
        owner: { select: { name: true, email: true } },
      },
    }),
    // Pickable channels: only ones that have agreed to work with us, plus
    // whatever the current filter is already pointing at.
    prisma.seedingChannel.findMany({
      where: { archivedAt: null, stage: { notIn: ["dropped"] } },
      orderBy: [{ name: "asc" }],
      select: { id: true, geoId: true, name: true, stage: true },
    }),
    prisma.seedingSubGeo.findMany({
      where: { archivedAt: null },
      orderBy: [{ geoId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, geoId: true, label: true },
    }),
  ]);

  return (
    <SessionLog
      geos={geoOptions(geos)}
      channels={channels}
      subGeos={subGeos}
      sessions={sessions.map((s) => ({
        id: s.id,
        geoId: s.geoId,
        subGeoId: s.subGeoId,
        subGeoLabel: s.subGeo?.label ?? null,
        channelId: s.channelId,
        channelName: s.channel?.name ?? null,
        kind: s.kind,
        status: s.status,
        title: s.title,
        scheduledAtISO: s.scheduledAt.toISOString(),
        originalScheduledAtISO: s.originalScheduledAt.toISOString(),
        heldAtISO: s.heldAt?.toISOString() ?? null,
        location: s.location,
        expectedReach: s.expectedReach,
        reachCount: s.reachCount,
        leadsCaptured: s.leadsCaptured,
        notes: s.notes,
        proofUrl: s.proofUrl,
        cancelledReason: s.cancelledReason,
        ownerLabel: s.owner?.name ?? s.owner?.email ?? null,
        editable: canEditGeoOutreach(access, s.geoId),
      }))}
      filters={{ geo: first(sp.geo) ?? "", status: status ?? "", channel: channelId ?? "" }}
      canEditFor={geoOptions(geos).filter((g) => canEditGeoOutreach(access, g.id)).map((g) => g.key)}
    />
  );
}
