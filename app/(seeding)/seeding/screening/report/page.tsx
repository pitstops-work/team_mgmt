import prisma from "@/lib/prisma";
import { visibleWhere } from "@/lib/seeding/screening/access";
import ScreeningNav from "../_components/ScreeningNav";
import { pageAccess } from "../_lib/load";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function ScreeningReportPage() {
  const s = await pageAccess();
  if (!s) redirect("/seeding/screening");
  const where = visibleWhere(s);

  const [geos, byGeo, belowCriteria, holds, reviews] = await Promise.all([
    prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.screeningApplication.groupBy({ by: ["geoId", "status"], where, _count: true }),
    prisma.screeningApplication.groupBy({ by: ["geoId"], where: { AND: [where, { NOT: { criteriaFlags: { equals: [] } } }] }, _count: true }),
    prisma.screeningApplication.findMany({
      where: { AND: [where, { status: { in: ["l2_hold", "l3_hold"] } }] },
      select: { geoId: true, updatedAt: true },
    }),
    prisma.screeningReview.findMany({
      where: { application: where, createdAt: { gte: new Date(Date.now() - 30 * DAY) } },
      select: {
        reviewerId: true,
        reviewer: { select: { name: true } },
        level: true,
        total: true,
        createdAt: true,
        application: { select: { geoId: true, createdAt: true, flags: true } },
      },
    }),
  ]);

  const rowsGeo = [...geos.filter((g) => s.all || s.screenGeoIds.includes(g.id)), ...(s.all ? [{ id: null, label: "Unassigned" }] : [])];
  const n = (geoId: string | null, statuses: string[]) =>
    byGeo.filter((b) => b.geoId === geoId && statuses.includes(b.status)).reduce((t, b) => t + b._count, 0);

  // Screeners: throughput, where their totals sit against their geography, turnaround.
  const geoMean = new Map<string | null, number>();
  for (const g of rowsGeo) {
    const ts = reviews.filter((r) => r.level === "l2" && r.total !== null && r.application.geoId === g.id).map((r) => r.total!);
    if (ts.length) geoMean.set(g.id, ts.reduce((a, b) => a + b, 0) / ts.length);
  }
  const people = new Map<string, { name: string; count: number; week: number; totals: number[]; offsets: number[]; waitDays: number[]; divergent: number }>();
  for (const r of reviews) {
    if (r.level !== "l2" || !r.reviewerId) continue;
    const p = people.get(r.reviewerId) ?? { name: r.reviewer?.name ?? "—", count: 0, week: 0, totals: [], offsets: [], waitDays: [], divergent: 0 };
    p.count++;
    if (r.createdAt.getTime() > Date.now() - 7 * DAY) p.week++;
    if (r.total !== null) {
      p.totals.push(r.total);
      const m = geoMean.get(r.application.geoId);
      if (m !== undefined) p.offsets.push(r.total - m);
    }
    p.waitDays.push((r.createdAt.getTime() - r.application.createdAt.getTime()) / DAY);
    if (r.application.flags.includes("divergent")) p.divergent++;
    people.set(r.reviewerId, p);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const sd = (xs: number[]) => {
    const m = mean(xs);
    return m === null || xs.length < 2 ? null : Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Screening report</h1>
      <p className="text-sm text-stone-500 mb-4">Where applications stand, and how screening is going.</p>
      <ScreeningNav active="report" canImport={s.all || s.canConfigure} canConfigure={s.canConfigure} />

      <h2 className="text-base font-semibold text-stone-900 mb-2">By geography</h2>
      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto mb-2">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
            <tr>
              {["Geography", "Received", "Below criteria", "Awaiting L2", "On hold", "Awaiting lead", "Approved", "Rejected", "Holds > 7 days"].map((h, i) => (
                <th key={h} className={`font-medium px-3 py-2 ${i ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rowsGeo.map((g) => {
              const received = n(g.id, ["new", "l2_hold", "l3_pending", "l3_hold", "approved", "rejected"]);
              const oldHolds = holds.filter((h) => h.geoId === g.id && h.updatedAt.getTime() < Date.now() - 7 * DAY).length;
              return (
                <tr key={g.id ?? "none"}>
                  <td className="px-3 py-2 text-stone-800">{g.label}</td>
                  <td className="px-3 py-2 text-right">{received}</td>
                  <td className="px-3 py-2 text-right text-stone-500">{belowCriteria.find((b) => b.geoId === g.id)?._count ?? 0}</td>
                  <td className="px-3 py-2 text-right">{n(g.id, ["new"])}</td>
                  <td className="px-3 py-2 text-right">{n(g.id, ["l2_hold", "l3_hold"])}</td>
                  <td className="px-3 py-2 text-right">{n(g.id, ["l3_pending"])}</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{n(g.id, ["approved"])}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{n(g.id, ["rejected"])}</td>
                  <td className={`px-3 py-2 text-right ${oldHolds ? "text-amber-700 font-medium" : "text-stone-400"}`}>{oldHolds}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-stone-400 mb-6">
        <a href="/api/seeding/screening/export" className="text-sky-600 hover:underline">
          Export all visible applications as CSV
        </a>
      </p>

      <h2 className="text-base font-semibold text-stone-900 mb-1">Screeners, last 30 days</h2>
      <p className="text-sm text-stone-500 mb-2">
        Against geography shows how far a screener&apos;s average L2 total sits from everyone&apos;s in the same geography. A
        large gap, or a large spread, is a reason to calibrate together.
      </p>
      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
            <tr>
              {["Screener", "L2 reads", "Last 7 days", "Average total", "Spread", "Against geography", "Days from receipt", "Divergent"].map((h, i) => (
                <th key={h} className={`font-medium px-3 py-2 ${i ? "text-right" : "text-left"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {[...people.entries()]
              .sort(([, a], [, b]) => b.count - a.count)
              .map(([uid, p]) => {
                const off = mean(p.offsets);
                return (
                  <tr key={uid}>
                    <td className="px-3 py-2 text-stone-800">{p.name}</td>
                    <td className="px-3 py-2 text-right">{p.count}</td>
                    <td className="px-3 py-2 text-right">{p.week}</td>
                    <td className="px-3 py-2 text-right">{mean(p.totals)?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{sd(p.totals)?.toFixed(1) ?? "—"}</td>
                    <td className={`px-3 py-2 text-right ${off !== null && Math.abs(off) > 10 ? "text-amber-700 font-medium" : ""}`}>
                      {off === null ? "—" : `${off > 0 ? "+" : ""}${off.toFixed(1)}`}
                    </td>
                    <td className="px-3 py-2 text-right">{mean(p.waitDays)?.toFixed(1) ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{p.divergent}</td>
                  </tr>
                );
              })}
            {people.size === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-stone-400">
                  No reviews yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
