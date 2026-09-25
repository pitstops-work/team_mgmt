import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { resolveFieldView, fieldHref } from "@/lib/field/viewAs";
import { PreviewBanner } from "../../operations/_shared/PreviewBanner";
import { getUserClusters } from "@/lib/operations/clusters";
import { loadInterventions, type InterventionRow } from "@/lib/field/queries";

export const dynamic = "force-dynamic";

// Screen 2 — one cluster: its interventions split into Live and Setting up.
export default async function ClusterPage({
  params,
  searchParams,
}: {
  params: Promise<{ clusterId: string }>;
  searchParams: Promise<{ asUser?: string }>;
}) {
  const { asUser } = await searchParams;
  const view = await resolveFieldView(asUser);
  if (!view) redirect("/operations");
  const { clusterId } = await params;

  const [clusters, rows] = await Promise.all([
    getUserClusters([view.userId]),
    loadInterventions(view.userId, clusterId),
  ]);
  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) notFound();

  const live = rows.filter((r) => r.phase === "live");
  const settingUp = rows.filter((r) => r.phase === "setting_up");
  const done = rows.filter((r) => r.phase === "done");
  // Carry the preview down so the intervention screen stays in the same person's shoes.
  const q = view.viewingAs ? `?asUser=${encodeURIComponent(view.userId)}` : "";

  return (
    <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
      {view.viewingAs && <PreviewBanner name={view.viewingAs.name} exitHref={`/field/${clusterId}`} />}
      <div>
        <Link href={fieldHref("/field", view)} className="inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-700">
          <ChevronLeft size={16} /> Clusters
        </Link>
        <h1 className="mt-2 text-lg font-semibold text-stone-900">{cluster.name}</h1>
      </div>

      <Section title="Live" subtitle="Regular visits on a cadence" rows={live} empty="No live interventions here." q={q} />
      <Section title="Setting up" subtitle="Steps to complete before go-live" rows={settingUp} empty="Nothing being set up here." q={q} />
      {done.length > 0 && <Section title="Done" subtitle="" rows={done} empty="" muted q={q} />}
    </div>
  );
}

function Section({ title, subtitle, rows, empty, muted, q }: { title: string; subtitle: string; rows: InterventionRow[]; empty: string; muted?: boolean; q: string }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className={`text-sm font-semibold ${muted ? "text-stone-400" : "text-stone-700"}`}>{title}</h2>
        {rows.length > 0 && <span className="text-xs text-stone-400">{rows.length}</span>}
      </div>
      {subtitle && rows.length > 0 && <p className="-mt-1 text-xs text-stone-400">{subtitle}</p>}
      {rows.length === 0 ? (
        empty ? <p className="text-sm text-stone-400">{empty}</p> : null
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Row row={r} muted={muted} q={q} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ row, muted, q }: { row: InterventionRow; muted?: boolean; q: string }) {
  return (
    <Link
      href={`/field/intervention/${row.id}${q}`}
      className={`group flex items-center gap-3 rounded-xl border p-3.5 transition hover:shadow-sm ${
        muted ? "border-stone-100 bg-stone-50" : "border-stone-200 bg-white hover:border-stone-300"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`truncate font-medium ${muted ? "text-stone-500" : "text-stone-900"}`}>{row.locationName}</span>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-500">{row.domainLabel}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
          {row.phase === "setting_up" && (
            // "Infrastructure · 3/9" when the front step carries a workstream tag,
            // plain "3/9 steps" when it doesn't.
            <span>
              {row.phaseLabel && <span className="font-medium text-stone-600">{row.phaseLabel} · </span>}
              {row.setupDone}/{row.setupTotal} steps
            </span>
          )}
          {row.phase === "live" && (
            <span className={row.behind ? "font-medium text-amber-700" : ""}>
              {row.visitDone}/{row.visitRequired} visits this month
            </span>
          )}
          {row.overdueSetup > 0 && <span className="font-medium text-red-600">{row.overdueSetup} overdue</span>}
          {row.overallOverdue && <span className="font-medium text-red-600">SLA passed</span>}
          {row.openFollowups > 0 && <span>{row.openFollowups} follow-up{row.openFollowups > 1 ? "s" : ""}</span>}
        </span>
      </span>
      {row.needsAttention && !muted && <AlertTriangle size={15} className="flex-shrink-0 text-amber-500" />}
      <ChevronRight size={17} className="flex-shrink-0 text-stone-300 group-hover:text-stone-400" />
    </Link>
  );
}
