import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getSeedingAccess, canEditGeoOutreach, canSeeLeads, leadGeoFilter } from "@/lib/seeding/access";
import { LEAD_STAGE_ORDER, LEAD_STAGE_META } from "@/lib/seeding/outreach";
import type { SeedingLeadStage } from "@/app/generated/prisma/client";
import { geoOptions, resolveGeoParam, first } from "../_lib/scope";
import LeadRegister from "./LeadRegister";

export default async function LeadsPage({
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

  // Counts are safe for anyone with portal access; names are not. Show the
  // shape of the register to a viewer, never its contents.
  if (!canSeeLeads(access)) {
    const counts = await prisma.seedingLead.groupBy({
      by: ["stage"],
      where: { archivedAt: null },
      _count: true,
    });
    const total = counts.reduce((n, c) => n + c._count, 0);
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-stone-900">Named leads</h1>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-600">
            {total} named lead{total === 1 ? "" : "s"} on the register.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {LEAD_STAGE_ORDER.map((s) => (
              <span key={s} className={`text-[11px] px-2 py-1 rounded-full ${LEAD_STAGE_META[s].chip}`}>
                {LEAD_STAGE_META[s].label} · {counts.find((c) => c.stage === s)?._count ?? 0}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-stone-400 mt-3">
            Names and contact details are personal data and are visible only to the programme team for that
            geography. The funnel runs on the session counts, not on this register.
          </p>
          <Link href="/seeding/outreach" className="text-xs text-sky-600 hover:underline mt-3 inline-block">← Outreach overview</Link>
        </div>
      </div>
    );
  }

  const visibleGeoIds = leadGeoFilter(access);
  const scope = resolveGeoParam(first(sp.geo), geos);
  const stage = first(sp.stage) as SeedingLeadStage | undefined;

  // Filter at the query, never in the component — a masked-in-React approach
  // still ships the names in the RSC payload. The ?geo= param NARROWS the
  // permitted set; it can never widen it, or a geo member could read another
  // geography's names by editing the URL.
  const permitted = visibleGeoIds; // null = every geography
  const scopeAllowed =
    scope === undefined ? false : permitted === null || (scope !== null && permitted.includes(scope));
  const geoWhereClause = scopeAllowed
    ? { geoId: scope as string | null }
    : permitted
      ? { geoId: { in: permitted } }
      : {};

  const [leads, channels] = await Promise.all([
    prisma.seedingLead.findMany({
      where: { archivedAt: null, ...geoWhereClause, ...(stage ? { stage } : {}) },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      include: {
        channel: { select: { id: true, name: true } },
        session: { select: { id: true, title: true } },
      },
    }),
    prisma.seedingChannel.findMany({
      where: { archivedAt: null, ...(visibleGeoIds ? { geoId: { in: visibleGeoIds } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, geoId: true, name: true },
    }),
  ]);

  const writableGeos = geoOptions(geos).filter((g) => canEditGeoOutreach(access, g.id));

  return (
    <LeadRegister
      geos={geoOptions(geos).filter((g) => visibleGeoIds === null || g.id === null || visibleGeoIds.includes(g.id))}
      channels={channels}
      leads={leads.map((l) => ({
        id: l.id,
        geoId: l.geoId,
        name: l.name,
        phone: l.phone,
        email: l.email,
        ageBand: l.ageBand,
        occupation: l.occupation,
        theme: l.theme,
        interestNote: l.interestNote,
        stage: l.stage,
        consented: l.consentAt !== null,
        channelId: l.channelId,
        channelName: l.channel?.name ?? null,
        sessionTitle: l.session?.title ?? null,
        createdAtISO: l.createdAt.toISOString(),
        editable: canEditGeoOutreach(access, l.geoId),
      }))}
      filters={{ geo: scopeAllowed ? first(sp.geo) ?? "" : "", stage: stage ?? "" }}
      writableGeoKeys={writableGeos.map((g) => g.key)}
      canHardDelete={access.canManageStructure}
    />
  );
}
