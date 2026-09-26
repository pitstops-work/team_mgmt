import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutGrid, ChevronLeft, ChevronRight, Clock, Unlink } from "lucide-react";
import { resolveFieldOversightView, fieldHref } from "@/lib/field/viewAs";
import { loadViewAsCandidates } from "@/lib/operations/viewAs";
import { PreviewBanner } from "../../operations/_shared/PreviewBanner";
import { ViewAsPicker } from "../../operations/_shared/ViewAsPicker";
import { getUserClusters } from "@/lib/operations/clusters";
import {
  loadFieldFacts, loadClusterZones, factsForCluster, factsForClusters, summarizeFacts,
  type FieldClusterStatus, type Rollup,
} from "@/lib/field/rollup";

export const dynamic = "force-dynamic";

/**
 * Where every cluster stands, on the field spine.
 *
 * The field spine was invisible to every manager surface — /command and
 * /operations/oversight read the old spine exclusively — so a domain migrated
 * to /field simply vanished from leadership view. This is the replacement.
 *
 * Card layout and status colours are lifted from
 * /operations/oversight/dashboard deliberately: a manager reading both must not
 * have to learn two visual languages. The one column the legacy card cannot
 * show is worst days-stuck, which is the whole point of computeSetupFront.
 */
export default async function FieldOversightPage({
  searchParams,
}: {
  searchParams: Promise<{ asUser?: string }>;
}) {
  const { asUser } = await searchParams;
  // Supervisor-scoped: an RP is bounced to their own /field home.
  const view = await resolveFieldOversightView(asUser);
  if (!view) redirect("/field");
  const preview = view.viewingAs;
  if (!preview && !view.targetIsSupervisor) redirect("/field");

  const [clusters, candidates] = await Promise.all([
    getUserClusters(view.visibleIds),
    view.isAdmin && !preview ? loadViewAsCandidates() : Promise.resolve([]),
  ]);
  const clusterIds = clusters.map((c) => c.id);
  const [facts, zoneOf] = await Promise.all([loadFieldFacts({ clusterIds }), loadClusterZones(clusterIds)]);

  // Each cluster's numbers come from membership — an intervention can belong
  // to two clusters. Its zone comes from Cluster.zoneId, so an empty cluster
  // still sits under the zone it belongs to.
  const clusterCards = clusters
    .map((c) => ({
      ...summarizeFacts(factsForCluster(facts, c.id), c.id, c.name),
      zoneId: zoneOf.get(c.id)?.zoneId ?? null,
      zoneLabel: zoneOf.get(c.id)?.zoneLabel ?? "Unzoned",
    }))
    // An assigned cluster holding nothing is a signal for a manager, unlike on
    // the RP home where it is just noise — so these are NOT filtered out.
    .sort((a, b) => a.zoneLabel.localeCompare(b.zoneLabel) || a.label.localeCompare(b.label));

  // Zone header: interventions counted once per zone by membership (so the
  // cluster cards can add up to more), status the worst of its clusters.
  const zones = new Map<string, { label: string; cards: typeof clusterCards }>();
  for (const c of clusterCards) {
    const k = c.zoneId ?? "__none";
    if (!zones.has(k)) zones.set(k, { label: c.zoneLabel, cards: [] });
    zones.get(k)!.cards.push(c);
  }
  const zoneSections = [...zones.entries()].map(([key, { label, cards }]) => ({
    key,
    label,
    cards,
    interventions: factsForClusters(facts, cards.map((c) => c.key)).length,
    status: worstStatus(cards.map((c) => c.status)),
  }));

  // Carry the preview down into the per-cluster drill-down.
  const q = preview ? `?asUser=${encodeURIComponent(view.userId)}` : "";

  const totals = {
    interventions: facts.length,
    live: facts.filter((f) => f.phase === "live").length,
    settingUp: facts.filter((f) => f.phase === "setting_up").length,
    attention: facts.filter((f) => f.needsAttention).length,
    brokenChains: facts.filter((f) => f.chainGaps.length > 0).length,
    overdueSetup: facts.reduce((n, f) => n + f.overdueSetup, 0),
    worstStuck: facts.reduce((n, f) => Math.max(n, f.front?.daysStuck ?? 0), 0),
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-6 sm:px-8">
      {preview && <PreviewBanner name={preview.name} exitHref="/field/oversight" />}

      {/* A previewed RP would be bounced to /field. Say so rather than bouncing
          the admin who asked the question — that reads as a broken link. */}
      {preview && !view.targetIsSupervisor && (
        <p className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
          {preview.name ?? "This user"}{preview.designation ? ` (${preview.designation})` : ""} is not a supervisor — they
          never see this dashboard. Opening /field/oversight redirects them to their own{" "}
          <Link href={fieldHref("/field", view)} className="underline">field home</Link>. Below is what the scope would
          hold if they did.
        </p>
      )}

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={fieldHref("/field", view)} className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
            <ChevronLeft className="h-3.5 w-3.5" /> Field
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 shrink-0 text-sky-600" />
            <h1 className="text-lg font-semibold text-stone-900">Cluster dashboard</h1>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">
            {totals.interventions} interventions · {totals.live} live · {totals.settingUp} setting up ·{" "}
            <span className={totals.attention > 0 ? "font-medium text-amber-700" : ""}>{totals.attention} need attention</span>
            {totals.brokenChains > 0 && <> · <span className="font-medium text-red-700">{totals.brokenChains} broken chain{totals.brokenChains > 1 ? "s" : ""}</span></>}
            {totals.worstStuck > 0 && <> · worst stuck {totals.worstStuck}d</>}
          </p>
        </div>
        {view.isAdmin && !preview && candidates.length > 0 && (
          <ViewAsPicker candidates={candidates} basePath="/field/oversight" />
        )}
      </header>

      {clusterCards.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
          No clusters assigned to you yet.
        </p>
      ) : (
        zoneSections.map((z) => (
          <section key={z.key} className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-400">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_STYLE[z.status].dot}`} title={STATUS_STYLE[z.status].label} />
              {z.label}
              <span className="text-[11px] font-normal normal-case tracking-normal text-stone-400">
                {z.interventions} interventions · {STATUS_STYLE[z.status].label}
              </span>
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {z.cards.map((c) => <ClusterCard key={c.key} c={c} q={q} />)}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

const STATUS_RANK: Record<FieldClusterStatus, number> = { healthy: 0, attention: 1, critical: 2 };
const worstStatus = (ss: FieldClusterStatus[]): FieldClusterStatus =>
  ss.reduce<FieldClusterStatus>((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), "healthy");

const STATUS_STYLE: Record<FieldClusterStatus, { dot: string; ring: string; label: string }> = {
  critical: { dot: "bg-red-500", ring: "border-red-200", label: "Needs attention" },
  attention: { dot: "bg-amber-500", ring: "border-amber-200", label: "Watch" },
  healthy: { dot: "bg-emerald-500", ring: "border-emerald-200", label: "On track" },
};

function ClusterCard({ c, q }: { c: Rollup; q: string }) {
  const s = STATUS_STYLE[c.status];
  const cadencePct = c.cadenceRequired > 0 ? Math.round((c.cadenceDone / c.cadenceRequired) * 100) : null;
  return (
    <Link href={`/field/oversight/${c.key}${q}`} className={`group block rounded-xl border bg-white p-4 transition-all hover:shadow-sm ${s.ring}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-800">{c.label}</span>
        <span className="text-[10px] font-medium text-stone-400">{s.label}</span>
        <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 group-hover:text-stone-400" />
      </div>

      {c.interventions === 0 ? (
        <p className="mt-2 text-[11px] text-stone-400">Nothing on the field spine here yet.</p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {c.live > 0 && <Chip tone="emerald">{c.live} live</Chip>}
            {c.settingUp > 0 && <Chip tone="amber">{c.settingUp} setup</Chip>}
            {c.overdueSetup > 0 && <Chip tone="red">{c.overdueSetup} overdue</Chip>}
            {c.openFollowups > 0 && <Chip tone="sky">{c.openFollowups} follow-ups</Chip>}
            {/* The column the legacy cluster card has no equivalent for. */}
            {c.maxDaysStuck > 0 && (
              <Chip tone="violet"><Clock className="mr-0.5 inline h-2.5 w-2.5" />stuck {c.maxDaysStuck}d</Chip>
            )}
          </div>

          {/* Interventions missing a link in Need → Plan → Guideline → RP → Status. */}
          {c.brokenChains > 0 && (
            <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-red-700">
              <Unlink className="h-3 w-3" /> {c.brokenChains} broken chain{c.brokenChains > 1 ? "s" : ""}
            </p>
          )}

          {cadencePct != null && (
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[11px] text-stone-500">
                <span>Visit cadence</span>
                <span className="font-medium tabular-nums">{c.cadenceDone}/{c.cadenceRequired} · {cadencePct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full ${cadencePct >= 70 ? "bg-emerald-400" : cadencePct >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(100, cadencePct)}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </Link>
  );
}

function Chip({ tone, children }: { tone: "red" | "sky" | "amber" | "emerald" | "violet"; children: React.ReactNode }) {
  const cls = {
    red: "text-red-700 bg-red-50 border-red-200",
    sky: "text-sky-700 bg-sky-50 border-sky-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
    violet: "text-violet-700 bg-violet-50 border-violet-200",
  }[tone];
  return <span className={`whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${cls}`}>{children}</span>;
}
