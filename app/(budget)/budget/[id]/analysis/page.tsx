import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { BudgetSection } from "@/app/generated/prisma/client";
import Link from "next/link";

const SECTION_LABELS: Record<BudgetSection, string> = {
  salary: "Salary & Honorarium", capex: "CAPEX",
  travel: "Travel", programme: "Programme",
  admin_salary: "Admin – Salaries", admin_other: "Admin – Other",
  additional: "Additional",
};

const INR = (n: number, dec = 0) =>
  n === 0 ? "–" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;

const L = (n: number) => `₹${(n / 100000).toFixed(2)}L`;

const AVG_HH_PER_SETTLEMENT = 150;

type BenefUnit = { label: string; count: number; description: string };

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  const budget = await prisma.budget.findUnique({
    where: { id },
    include: { inputs: true, lines: { orderBy: { position: "asc" } } },
  });

  if (!budget || budget.partnerId !== session!.user!.id!) notFound();
  if (!budget.inputs) return <div className="text-stone-400 p-8">No inputs recorded for this budget.</div>;

  const domainConfigs = await prisma.budgetDomainConfig.findMany({
    where: { city: budget.city },
    select: { key: true, label: true, beneficiaryLabel: true, beneficiaryVar: true, beneficiaryMult: true },
  });
  const domainLabelMap = Object.fromEntries(domainConfigs.map(d => [d.key, d.label]));
  const domainConfigMap = Object.fromEntries(domainConfigs.map(d => [d.key, d]));

  // Merged inputs: typed fields (backward compat) + extraInputs (new budgets, any domain)
  const raw = budget.inputs;
  const inp: Record<string, number> = {
    nSettlements: raw.nSettlements, nClusters: raw.nClusters,
    nCLCs: raw.nCLCs, clcRentPerMonth: raw.clcRentPerMonth,
    nYRCs: raw.nYRCs, yrcRentPerMonth: raw.yrcRentPerMonth,
    nElderlyCentres: raw.nElderlyCentres, nElderly: raw.nElderly,
    elderlyCentreRentPerMonth: raw.elderlyCentreRentPerMonth,
    cosPerCluster: raw.cosPerCluster, rcRentPerMonth: raw.rcRentPerMonth,
    nCreches: raw.nCreches, crecheRentPerMonth: raw.crecheRentPerMonth,
    ...(raw.extraInputs as Record<string, number>),
  };

  const lines = budget.lines;
  const years = budget.years;

  const domainTotal = (domain: string | null, yr: "y1" | "y2" | "y3") =>
    lines.filter(l => l.domain === domain).reduce((s, l) => s + l[`${yr}Total`], 0);

  const sectionTotal = (section: BudgetSection, yr: "y1" | "y2" | "y3") =>
    lines.filter(l => l.section === section).reduce((s, l) => s + l[`${yr}Total`], 0);

  const grandTotal = (yr: "y1" | "y2" | "y3") =>
    lines.reduce((s, l) => s + l[`${yr}Total`], 0);

  const gt1 = grandTotal("y1");
  const gt2 = grandTotal("y2");
  const gt3 = grandTotal("y3");

  // Dynamic beneficiary units from domain configs
  const benefUnits = budget.domains
    .map(domainKey => {
      const config = domainConfigMap[domainKey];
      if (!config?.beneficiaryVar) return null;
      const rawCount = inp[config.beneficiaryVar] ?? 0;
      const count = Math.round(rawCount * config.beneficiaryMult);
      if (count === 0) return null;
      return {
        domain: domainKey,
        label: config.beneficiaryLabel ?? config.label,
        count,
        description: `${rawCount} ${config.beneficiaryVar} × ${config.beneficiaryMult}`,
        total: domainTotal(domainKey, "y1"),
      };
    })
    .filter(Boolean) as (BenefUnit & { domain: string; total: number })[];

  const totalBeneficiaries = benefUnits.reduce((s, b) => s + b.count, 0);

  const sections: BudgetSection[] = ["salary", "capex", "travel", "programme", "admin_salary", "admin_other"];
  const headData = sections.map(s => ({
    section: s,
    y1: sectionTotal(s, "y1"),
    pct: gt1 > 0 ? sectionTotal(s, "y1") / gt1 * 100 : 0,
  })).filter(h => h.y1 > 0);

  const salaryTotal   = sectionTotal("salary", "y1");
  const adminTotal    = sectionTotal("admin_salary", "y1") + sectionTotal("admin_other", "y1");
  const programmeTotal = gt1 - salaryTotal - adminTotal - sectionTotal("capex", "y1") - sectionTotal("travel", "y1");

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/budget/${budget.id}`} className="text-xs text-stone-400 hover:text-stone-700">← Back to budget</Link>
        <span className="text-stone-300">|</span>
        <h1 className="text-lg font-semibold text-stone-900">{budget.name} — Cost Analysis</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Year 1 Total" value={L(gt1)} sub={`${INR(gt1 / 12)} /month`} />
        {years === 3 && <>
          <StatCard label="Year 2 Total" value={L(gt2)} sub={`+${((gt2/gt1 - 1) * 100).toFixed(1)}% vs Y1`} />
          <StatCard label="Year 3 Total" value={L(gt3)} sub={`+${((gt3/gt1 - 1) * 100).toFixed(1)}% vs Y1`} />
          <StatCard label="3-Year Total" value={L(gt1 + gt2 + gt3)} sub="cumulative" highlight />
        </>}
        <StatCard label="Total beneficiaries" value={totalBeneficiaries.toLocaleString("en-IN")} sub="across all domains" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">

        <section>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Per-Beneficiary Cost (Year 1)</h2>
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                  <th className="text-left px-4 py-2.5">Domain</th>
                  <th className="text-right px-3 py-2.5">Beneficiaries</th>
                  <th className="text-right px-3 py-2.5">Domain total</th>
                  <th className="text-right px-3 py-2.5 font-medium">Cost / person / yr</th>
                </tr>
              </thead>
              <tbody>
                {benefUnits.map(b => (
                  <tr key={b.domain} className="border-b border-stone-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800">{domainLabelMap[b.domain] ?? b.domain}</div>
                      <div className="text-xs text-stone-400">{b.description}</div>
                    </td>
                    <td className="text-right px-3 py-3 text-stone-600">{b.count.toLocaleString("en-IN")}</td>
                    <td className="text-right px-3 py-3 text-stone-600">{L(b.total)}</td>
                    <td className="text-right px-3 py-3 font-semibold text-sky-700">
                      {b.count > 0 ? INR(b.total / b.count) : "–"}
                    </td>
                  </tr>
                ))}
                {inp.nSettlements > 0 && (
                  <tr className="border-b border-stone-50 bg-stone-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-700">Overall (all domains)</div>
                      <div className="text-xs text-stone-400">{inp.nSettlements} settlements · {totalBeneficiaries.toLocaleString("en-IN")} beneficiaries</div>
                    </td>
                    <td className="text-right px-3 py-3 text-stone-500">{totalBeneficiaries.toLocaleString("en-IN")}</td>
                    <td className="text-right px-3 py-3 text-stone-500">{L(gt1)}</td>
                    <td className="text-right px-3 py-3 font-semibold text-stone-800">
                      {totalBeneficiaries > 0 ? INR(gt1 / totalBeneficiaries) : "–"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-stone-700 mb-3">Budget Head Breakdown</h2>
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                  <th className="text-left px-4 py-2.5">Head</th>
                  <th className="text-right px-3 py-2.5">Year 1</th>
                  <th className="text-right px-3 py-2.5">% of total</th>
                </tr>
              </thead>
              <tbody>
                {headData.map(h => (
                  <tr key={h.section} className="border-b border-stone-50">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-sm" style={{ background: sectionColor(h.section) }} />
                        {SECTION_LABELS[h.section]}
                      </div>
                    </td>
                    <td className="text-right px-3 py-2.5 text-stone-700">{L(h.y1)}</td>
                    <td className="text-right px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-stone-100 rounded-full">
                          <div className="h-full rounded-full" style={{ width: `${h.pct}%`, background: sectionColor(h.section) }} />
                        </div>
                        <span className="text-xs text-stone-600 w-10 text-right">{h.pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-stone-100 grid grid-cols-3 gap-3 bg-stone-50">
              <MiniStat label="Salary %" value={gt1 > 0 ? `${(salaryTotal/gt1*100).toFixed(1)}%` : "–"} />
              <MiniStat label="Programme %" value={gt1 > 0 ? `${(programmeTotal/gt1*100).toFixed(1)}%` : "–"} />
              <MiniStat label="Admin %" value={gt1 > 0 ? `${(adminTotal/gt1*100).toFixed(1)}%` : "–"}
                note={adminTotal/gt1 > 0.15 ? "above 15% limit" : undefined} />
            </div>
          </div>
        </section>

        {inp.nSettlements > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-stone-700 mb-3">Per-Settlement Analysis</h2>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                    <th className="text-left px-4 py-2.5">Metric</th>
                    <th className="text-right px-3 py-2.5">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["No. of settlements", String(inp.nSettlements)],
                    ["No. of clusters", String(inp.nClusters)],
                    ["Avg settlements per cluster", inp.nClusters > 0 ? (inp.nSettlements / inp.nClusters).toFixed(1) : "–"],
                    ["Cost per settlement / year", gt1 > 0 ? INR(gt1 / inp.nSettlements) : "–"],
                    ["Cost per household / year", gt1 > 0 ? INR(gt1 / (inp.nSettlements * AVG_HH_PER_SETTLEMENT)) : "–"],
                    ["Cost per cluster / year", inp.nClusters > 0 && gt1 > 0 ? L(gt1 / inp.nClusters) : "–"],
                  ].map(([label, val]) => (
                    <tr key={label} className="border-b border-stone-50">
                      <td className="px-4 py-2.5 text-stone-600">{label}</td>
                      <td className="text-right px-3 py-2.5 font-medium text-stone-800">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {years === 3 && (
          <section>
            <h2 className="text-sm font-semibold text-stone-700 mb-3">3-Year Cost Projection</h2>
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50 text-xs text-stone-500">
                    <th className="text-left px-4 py-2.5">Year</th>
                    <th className="text-right px-3 py-2.5">Total</th>
                    <th className="text-right px-3 py-2.5">vs Y1</th>
                    <th className="text-right px-3 py-2.5">Per beneficiary</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { yr: "Year 1", total: gt1, base: gt1 },
                    { yr: "Year 2", total: gt2, base: gt1 },
                    { yr: "Year 3", total: gt3, base: gt1 },
                  ].map(({ yr, total, base }) => (
                    <tr key={yr} className="border-b border-stone-50">
                      <td className="px-4 py-2.5 text-stone-700">{yr}</td>
                      <td className="text-right px-3 py-2.5 font-medium text-stone-800">{L(total)}</td>
                      <td className="text-right px-3 py-2.5 text-xs text-stone-500">
                        {base > 0 && total !== base ? `+${((total/base - 1)*100).toFixed(1)}%` : "–"}
                      </td>
                      <td className="text-right px-3 py-2.5 text-stone-600">
                        {totalBeneficiaries > 0 ? INR(total / totalBeneficiaries) : "–"}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-stone-50 font-medium">
                    <td className="px-4 py-2.5 text-stone-700">3-Year Total</td>
                    <td className="text-right px-3 py-2.5 text-sky-700">{L(gt1 + gt2 + gt3)}</td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${highlight ? "bg-sky-50 border-sky-200" : "bg-white border-stone-200"}`}>
      <div className="text-xs text-stone-500">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${highlight ? "text-sky-700" : "text-stone-900"}`}>{value}</div>
      {sub && <div className="text-xs text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function MiniStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-xs text-stone-400">{label}</div>
      <div className={`text-sm font-semibold ${note ? "text-red-600" : "text-stone-800"}`}>{value}</div>
      {note && <div className="text-xs text-red-400">{note}</div>}
    </div>
  );
}

function sectionColor(section: BudgetSection): string {
  const map: Partial<Record<BudgetSection, string>> = {
    salary: "#6366f1", capex: "#f59e0b", travel: "#10b981",
    programme: "#0ea5e9", admin_salary: "#8b5cf6", admin_other: "#ec4899",
  };
  return map[section] ?? "#94a3b8";
}
