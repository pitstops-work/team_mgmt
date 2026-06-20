"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedBudget } from "@/lib/budget/importTemplate";

const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

export default function ImportBudgetClient() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedBudget | null>(null);
  const [busy, setBusy] = useState<"parse" | "commit" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(commit: boolean): Promise<Response> {
    const fd = new FormData();
    fd.set("file", file!);
    if (commit) fd.set("commit", "1");
    return fetch("/budget/import/parse", { method: "POST", body: fd });
  }

  async function onParse() {
    if (!file) return;
    setBusy("parse"); setError(null); setPreview(null);
    try {
      const res = await send(false);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not read the file."); return; }
      setPreview(json.preview as ParsedBudget);
    } catch { setError("Upload failed — please try again."); }
    finally { setBusy(null); }
  }

  async function onCommit() {
    if (!file) return;
    setBusy("commit"); setError(null);
    try {
      const res = await send(true);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Could not create the budget."); return; }
      router.push(`/budget/${json.id}`);
    } catch { setError("Could not create the budget — please try again."); }
    finally { setBusy(null); }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Upload */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError(null); }}
            className="text-sm"
          />
          <button
            onClick={onParse}
            disabled={!file || busy !== null}
            className="text-sm bg-stone-900 text-white px-4 py-2 rounded-lg hover:bg-stone-700 disabled:opacity-50"
          >
            {busy === "parse" ? "Reading…" : "Read file"}
          </button>
        </div>
        <p className="text-xs text-stone-400 mt-2">
          Only .xlsx files exported from this app can be imported (they carry the hidden data this needs).
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm px-4 py-3">{error}</div>
      )}

      {/* Preview */}
      {preview && (
        <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-stone-100">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-stone-900">{preview.name}</h2>
              <span className="text-lg font-semibold text-stone-900 tabular-nums">{fmtINR(preview.grandTotal)}</span>
            </div>
            <div className="mt-1 text-xs text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
              <span>City: {preview.city}</span>
              <span>Horizon: {preview.horizonMonths} mo ({preview.years}y)</span>
              <span>Domains: {preview.domains.length ? preview.domains.join(", ") : "all"}</span>
              <span>Inflation: {preview.applyInflation ? `on (${preview.inflationPct.Salary}/${preview.inflationPct.Other}/${preview.inflationPct.Nil}%)` : "off"}</span>
              <span>{preview.lines.length} lines · {preview.lines.filter(l => l.edited).length} edited</span>
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="px-5 py-3 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs space-y-0.5">
              {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          )}

          <div className="max-h-[460px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-stone-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Description</th>
                  <th className="text-left font-medium px-2 py-2">Section</th>
                  <th className="text-right font-medium px-2 py-2">Y1 Units</th>
                  <th className="text-right font-medium px-2 py-2">Y1 Unit cost</th>
                  <th className="text-right font-medium px-4 py-2">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {preview.lines.map((l, i) => {
                  const total = l.y1Total + l.y2Total + l.y3Total + l.y4Total + l.y5Total;
                  return (
                    <tr key={i} className={l.edited ? "bg-amber-50/40" : ""}>
                      <td className="px-4 py-1.5">
                        {l.description}
                        {l.edited && <span className="ml-2 text-[10px] text-amber-600 align-middle">edited</span>}
                      </td>
                      <td className="px-2 py-1.5 text-stone-500 text-xs">{l.section}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{l.y1Units || ""}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{l.y1UnitCost ? fmtINR(l.y1UnitCost) : ""}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{fmtINR(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-stone-100 flex items-center justify-between gap-3">
            <p className="text-xs text-stone-400">
              Totals are recomputed as Units × Unit cost × Allocation%.
            </p>
            <button
              onClick={onCommit}
              disabled={busy !== null}
              className="text-sm bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 shrink-0"
            >
              {busy === "commit" ? "Creating…" : "Create budget →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
