import type { NeedCoverageRow } from "@/lib/field/adminData";

/**
 * Need vs interventions — the Need → Plan link. Read-only: the need figures
 * are the Needs module's, and closing a gap is an operator decision.
 */
export function NeedCoverage({ rows }: { rows: NeedCoverageRow[] }) {
  const gaps = rows.filter((r) => r.gap > 0);
  return (
    <section className="mx-auto max-w-4xl space-y-2 px-5 pb-8">
      <h2 className="text-sm font-semibold text-stone-800">Need vs interventions</h2>
      <p className="text-xs text-stone-500">
        Addressable need from the latest settlement assessment, against field interventions in the same cluster.
        Only domains with an addressable count are listed. {gaps.length > 0 && <>{gaps.length} cluster/domain pairs have unplanned need.</>}
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-stone-200 bg-white px-4 py-6 text-center text-sm text-stone-400">
          No addressable need recorded for the field domains yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-left text-[11px] uppercase text-stone-400">
                <th className="px-3 py-2 font-medium">Cluster</th>
                <th className="px-3 py-2 font-medium">Domain</th>
                <th className="px-3 py-2 text-right font-medium">Addressable need</th>
                <th className="px-3 py-2 text-right font-medium">Field interventions</th>
                <th className="px-3 py-2 text-right font-medium">Gap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.clusterId}|${r.domain}`} className="border-b border-stone-50 last:border-0">
                  <td className="px-3 py-1.5 text-stone-800">{r.clusterName}</td>
                  <td className="px-3 py-1.5 text-stone-600">{r.domainLabel}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-stone-600">{r.need}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-stone-600">{r.interventions}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${r.gap > 0 ? "font-semibold text-red-700" : "text-stone-400"}`}>
                    {r.gap}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
