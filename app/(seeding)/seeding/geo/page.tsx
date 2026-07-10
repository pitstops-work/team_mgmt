import Link from "next/link";
import prisma from "@/lib/prisma";
import { computeTargets, pct, trackBand } from "@/lib/seeding/funnel";
import { ProgressBar } from "../_components/bits";

const trackColor = { ontrack: "bg-emerald-500", warn: "bg-amber-500", behind: "bg-rose-500" } as const;

export default async function GeoIndex() {
  const [config, geos] = await Promise.all([
    prisma.seedingFunnelConfig.findUnique({ where: { id: 1 } }),
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" }, include: { funnel: true, _count: { select: { members: true } } } }),
  ]);
  const targets = config ? computeTargets(config, geos.length) : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Geographies</h1>
        <p className="text-sm text-stone-500 mt-0.5">Each geo builds its own reach → lead pool that converts to its 2,500-application floor at launch.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {geos.map((g) => {
          const reach = g.funnel?.reachToDate ?? 0, leads = g.funnel?.leadsToDate ?? 0;
          const rp = targets ? pct(reach, targets.perGeo.reachTarget) : 0;
          const lp = targets ? pct(leads, targets.perGeo.leadTarget) : 0;
          return (
            <Link key={g.id} href={`/seeding/geo/${g.key}`} className="rounded-xl border border-stone-200 bg-white p-4 hover:border-sky-300 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-stone-900">{g.label}</span>
                <span className="text-[11px] text-stone-400">{g._count.members} in team</span>
              </div>
              <div className="mt-3 space-y-2">
                <div>
                  <div className="flex justify-between text-[11px] text-stone-400"><span>Reach</span><span>{reach.toLocaleString("en-IN")} / {targets ? targets.perGeo.reachTarget.toLocaleString("en-IN") : "—"} · {rp}%</span></div>
                  <div className="mt-1"><ProgressBar pct={rp} color={trackColor[trackBand(rp)]} /></div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-stone-400"><span>Leads</span><span>{leads.toLocaleString("en-IN")} / {targets ? targets.perGeo.leadTarget.toLocaleString("en-IN") : "—"} · {lp}%</span></div>
                  <div className="mt-1"><ProgressBar pct={lp} color={trackColor[trackBand(lp)]} /></div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
