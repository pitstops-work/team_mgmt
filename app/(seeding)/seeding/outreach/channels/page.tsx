import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess, canEditGeoOutreach } from "@/lib/seeding/access";
import type { SeedingChannelKind, SeedingChannelStage } from "@/app/generated/prisma/client";
import { geoOptions, resolveGeoParam, geoWhere, first } from "../_lib/scope";
import ChannelDirectory from "./ChannelDirectory";

export default async function ChannelsPage({
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
  const kind = first(sp.kind) as SeedingChannelKind | undefined;
  const stage = first(sp.stage) as SeedingChannelStage | undefined;
  const q = first(sp.q)?.trim() ?? "";

  const [channels, subGeos] = await Promise.all([
    prisma.seedingChannel.findMany({
      where: {
        archivedAt: null,
        ...geoWhere(scope),
        ...(kind ? { kind } : {}),
        ...(stage ? { stage } : {}),
        ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
      },
      orderBy: [{ stage: "asc" }, { name: "asc" }],
      take: 500,
      include: {
        subGeo: { select: { id: true, label: true } },
        owner: { select: { name: true, email: true } },
      },
    }),
    prisma.seedingSubGeo.findMany({
      where: { archivedAt: null },
      orderBy: [{ geoId: "asc" }, { sortOrder: "asc" }],
      select: { id: true, geoId: true, label: true },
    }),
  ]);

  return (
    <ChannelDirectory
      geos={geoOptions(geos)}
      subGeos={subGeos}
      channels={channels.map((c) => ({
        id: c.id,
        geoId: c.geoId,
        subGeoId: c.subGeoId,
        subGeoLabel: c.subGeo?.label ?? null,
        kind: c.kind,
        stage: c.stage,
        name: c.name,
        nameKey: c.nameKey,
        contactName: c.contactName,
        contactRole: c.contactRole,
        contactPhone: c.contactPhone,
        contactEmail: c.contactEmail,
        externalCode: c.externalCode,
        district: c.district,
        address: c.address,
        websiteUrl: c.websiteUrl,
        estimatedReach: c.estimatedReach,
        notes: c.notes,
        source: c.source,
        ownerLabel: c.owner?.name ?? c.owner?.email ?? null,
        sessionsHeld: c.sessionsHeld,
        reachToDate: c.reachToDate,
        leadsToDate: c.leadsToDate,
        editable: canEditGeoOutreach(access, c.geoId),
      }))}
      filters={{ geo: first(sp.geo) ?? "", kind: kind ?? "", stage: stage ?? "", q }}
      canEditFor={geoOptions(geos)
        .filter((g) => canEditGeoOutreach(access, g.id))
        .map((g) => g.key)}
      truncated={channels.length === 500}
    />
  );
}
