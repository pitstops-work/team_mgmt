import prisma from "@/lib/prisma";

const SECTION_TITLE: Record<string, string> = {
  provides: "What the partner provides",
  spoc: "What our SPOC / coordinator provides",
  cadence: "Interaction cadence",
};

export default async function ReferencePage() {
  const [roles, execs, partner] = await Promise.all([
    prisma.seedingRoleDef.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.seedingExecPhase.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.seedingPartnerInterface.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const partnerSections = ["provides", "spoc", "cadence"].map((s) => ({
    key: s,
    rows: partner.filter((p) => p.section === s),
  })).filter((s) => s.rows.length > 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Reference</h1>
        <p className="text-sm text-stone-500 mt-0.5">Roles, the post-launch execution arc, and the informal partner interface — for orientation.</p>
      </div>

      {/* Roles */}
      <section>
        <h2 className="text-sm font-semibold text-stone-700 mb-2">Roles, hires & responsibilities</h2>
        <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-stone-400 bg-stone-50">
              <tr>{["Role", "New hire?", "Reports to", "Count", "Core responsibility", "Owns", "By"].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-stone-800">{r.role}</td>
                  <td className="px-3 py-2 text-stone-500">{r.newHire}</td>
                  <td className="px-3 py-2 text-stone-500">{r.reportsTo}</td>
                  <td className="px-3 py-2 text-stone-500">{r.count}</td>
                  <td className="px-3 py-2 text-stone-600 min-w-[220px]">{r.coreResponsibility}</td>
                  <td className="px-3 py-2 text-stone-500">{r.ownsWorkstreams}</td>
                  <td className="px-3 py-2 text-stone-500">{r.inPlaceBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Execution arc */}
      <section>
        <h2 className="text-sm font-semibold text-stone-700 mb-2">Fellowship execution — post-launch arc</h2>
        <div className="space-y-2">
          {execs.map((e) => (
            <div key={e.id} className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-sm font-medium text-stone-900">{e.code ? `${e.code} · ` : ""}{e.phase}</div>
                <div className="text-[11px] text-stone-400">{e.window}{e.quarters ? ` · ${e.quarters}` : ""}</div>
              </div>
              {e.activities && <div className="text-xs text-stone-600 mt-1">{e.activities}</div>}
              {e.milestones && <div className="text-xs text-emerald-700 mt-1">✓ {e.milestones}</div>}
            </div>
          ))}
        </div>
      </section>

      {/* Partner interface */}
      <section>
        <h2 className="text-sm font-semibold text-stone-700 mb-2">Partner–SPOC interface (informal by design)</h2>
        <div className="space-y-4">
          {partnerSections.map((sec) => {
            const [header, ...rows] = sec.rows;
            const cols = [header.colA, header.colB, header.colC, header.colD, header.colE];
            const active = cols.map((h) => !!h); // which columns have a header
            const pick = (r: typeof header) => [r.colA, r.colB, r.colC, r.colD, r.colE];
            return (
              <div key={sec.key}>
                <div className="text-xs font-medium text-stone-600 mb-1">{SECTION_TITLE[sec.key]}</div>
                <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] uppercase tracking-wide text-stone-400 bg-stone-50">
                      <tr>{cols.map((h, i) => active[i] ? <th key={i} className="px-3 py-2 text-left font-medium">{h}</th> : null)}</tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {rows.map((r) => (
                        <tr key={r.id}>
                          {pick(r).map((c, i) => active[i] ? <td key={i} className="px-3 py-2 text-stone-600 align-top min-w-[140px]">{c}</td> : null)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
