import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { getFieldSession } from "@/lib/field/access";
import { getUserClusters } from "@/lib/operations/clusters";
import { loadFieldFacts, factsForCluster, rollupFacts, byPhase, type FieldFact } from "@/lib/field/rollup";
import { ymKey } from "@/lib/operations/month";

export const dynamic = "force-dynamic";

/**
 * One cluster, ordered by what is most stuck.
 *
 * Three reads of the same facts, no extra queries:
 *   - the stuck list: every intervention, worst first, naming the step it is
 *     sitting on and for how long
 *   - a phase roll-up: "4 stuck in Infrastructure" — only possible because
 *     phaseTag was carried across when the domains were derived
 *   - a six-month visit heatmap, which is where cadence problems are visible as
 *     a pattern rather than a single month's percentage
 *
 * The legacy equivalents (SetupMatrix, VisitHeatmap under /command) are far
 * larger because the old spine has a dependency graph and workstreams; a flat
 * ordered step list per goal needs much less machinery.
 */
export default async function FieldClusterOversightPage({ params }: { params: Promise<{ clusterId: string }> }) {
  const session = await getFieldSession();
  if (!session) redirect("/operations");
  const { clusterId } = await params;

  const clusters = await getUserClusters([session.userId]);
  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) notFound();

  const allFacts = await loadFieldFacts({ clusterIds: [clusterId] });
  const facts = factsForCluster(allFacts, clusterId);

  const stuck = [...facts].sort(
    (a, b) =>
      (b.front?.daysStuck ?? -1) - (a.front?.daysStuck ?? -1) ||
      Number(b.needsAttention) - Number(a.needsAttention) ||
      a.locationName.localeCompare(b.locationName),
  );
  const phases = rollupFacts(facts, byPhase);

  // Six months of closed visits, oldest first.
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) months.push(ymKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const liveFacts = facts.filter((f) => f.phase === "live");

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-6 sm:px-8">
      <header>
        <Link href="/field/oversight" className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
          <ChevronLeft className="h-3.5 w-3.5" /> Cluster dashboard
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-stone-900">{cluster.name}</h1>
        <p className="mt-0.5 text-xs text-stone-500">
          {facts.length} interventions · {facts.filter((f) => f.needsAttention).length} need attention
        </p>
      </header>

      {facts.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
          Nothing on the field spine in this cluster yet.
        </p>
      ) : (
        <>
          {phases.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Where setup work is sitting</h2>
              <div className="flex flex-wrap gap-2">
                {phases.map((p) => (
                  <div key={p.key} className="rounded-lg border border-stone-200 bg-white px-3 py-1.5">
                    <div className="text-sm font-semibold text-stone-800">{p.interventions}</div>
                    <div className="text-[11px] text-stone-500">{p.label}</div>
                    {p.maxDaysStuck > 0 && <div className="text-[10px] text-stone-400">worst {p.maxDaysStuck}d</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Most stuck first</h2>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              {stuck.map((f) => <StuckRow key={f.goalId} f={f} />)}
            </div>
          </section>

          {liveFacts.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-400">Visits closed, last 6 months</h2>
              <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stone-100 text-left text-[11px] uppercase text-stone-400">
                      <th className="px-3 py-2 font-medium">Intervention</th>
                      {months.map((m) => (
                        <th key={m} className="px-2 py-2 text-center font-medium">{m.slice(5)}</th>
                      ))}
                      <th className="px-3 py-2 text-center font-medium">This month</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveFacts.map((f) => (
                      <tr key={f.goalId} className="border-b border-stone-50 last:border-0">
                        <td className="max-w-[16rem] truncate px-3 py-1.5 text-xs text-stone-700">{f.locationName}</td>
                        {months.map((m) => {
                          const n = f.visitsByMonth[m] ?? 0;
                          return (
                            <td key={m} className="px-2 py-1.5 text-center">
                              <span
                                className={`inline-flex h-6 w-6 items-center justify-center rounded text-[11px] tabular-nums ${
                                  n === 0 ? "bg-stone-50 text-stone-300" : n === 1 ? "bg-emerald-100 text-emerald-800" : "bg-emerald-200 text-emerald-900"
                                }`}
                              >
                                {n || "·"}
                              </span>
                            </td>
                          );
                        })}
                        <td className={`px-3 py-1.5 text-center text-xs tabular-nums ${f.behind ? "font-medium text-amber-700" : "text-stone-500"}`}>
                          {f.cadenceDone}/{f.cadenceRequired}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StuckRow({ f }: { f: FieldFact }) {
  return (
    <Link
      href={`/field/intervention/${f.goalId}`}
      className="group flex items-center gap-3 border-b border-stone-50 px-4 py-3 last:border-0 hover:bg-stone-50"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-stone-900">{f.locationName}</span>
          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">{f.domainLabel}</span>
          {f.phase === "setting_up" && f.phaseLabel && (
            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">{f.phaseLabel}</span>
          )}
        </span>
        {/* What it is actually sitting on — the question a manager is asking. */}
        {f.front ? (
          <span className="mt-0.5 block truncate text-xs text-stone-500">
            {f.front.title}
            {f.front.blockedCount > 0 && <span className="text-stone-400"> · {f.front.blockedCount} blocked behind it</span>}
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-stone-400">
            {f.phase === "live" ? `${f.cadenceDone}/${f.cadenceRequired} visits this month` : "Setup complete"}
          </span>
        )}
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-stone-400">
          <span>{f.ownerName}</span>
          {f.phase === "setting_up" && <span>{f.setupDone}/{f.setupTotal} steps</span>}
          {f.overdueSetup > 0 && <span className="font-medium text-red-600">{f.overdueSetup} overdue</span>}
          {f.overallOverdue && <span className="font-medium text-red-600">SLA passed</span>}
          {f.behind && <span className="font-medium text-amber-700">behind on visits</span>}
          {f.overdueFollowups > 0 && <span className="font-medium text-amber-700">{f.overdueFollowups} overdue follow-up{f.overdueFollowups > 1 ? "s" : ""}</span>}
          {f.lastVisitAt && <span>last visit {f.lastVisitAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
        </span>
      </span>

      {f.front && f.front.daysStuck > 0 && (
        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-stone-700">{f.front.daysStuck}d</span>
          <span className="block text-[10px] text-stone-400">on this step</span>
        </span>
      )}
      {f.needsAttention && <AlertTriangle size={15} className="shrink-0 text-amber-500" />}
      <ChevronRight size={17} className="shrink-0 text-stone-300 group-hover:text-stone-400" />
    </Link>
  );
}
