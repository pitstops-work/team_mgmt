"use client";

import { useTransition } from "react";
import { pct, trackBand, type FunnelTargets } from "@/lib/seeding/funnel";
import { updateSeedingFunnelGeo, updateSeedingFunnelConfig } from "../actions";

type Cfg = { fellowsPerGeo: number; selectionRatio: number; appBufferPct: number; leadToApp: number; coldReachToApp: number; reachToLead: number; shareFromWarm: number };
type Geo = { id: string; label: string; reachToDate: number; leadsToDate: number; appsReceived: number; screened: number; shortlisted: number; editable: boolean };

const bandText = { ontrack: "text-emerald-600", warn: "text-amber-600", behind: "text-rose-600" } as const;
const nf = (n: number) => n.toLocaleString("en-IN");

export default function FunnelEditor({ config, targets, geos, canEditConfig }: { config: Cfg; targets: FunnelTargets; geos: Geo[]; canEditConfig: boolean }) {
  const [pending, start] = useTransition();
  const saveGeo = (geoId: string, field: keyof Omit<Geo, "id" | "label" | "editable">, v: number) =>
    start(() => updateSeedingFunnelGeo(geoId, { [field]: v }));
  const saveCfg = (field: keyof Cfg, v: number) => start(() => updateSeedingFunnelConfig({ [field]: v }));

  const sum = (f: keyof Geo) => geos.reduce((s, g) => s + (g[f] as number), 0);
  const numInput = "w-24 text-right tabular-nums rounded border border-stone-300 px-2 py-1 text-sm disabled:bg-stone-50 disabled:text-stone-400";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Funnel</h1>
        <p className="text-sm text-stone-500 mt-0.5">Two-stage model. Applications exist only after launch — before that, build reach → leads. Targets are computed from the assumptions; edit only your geo&apos;s actuals.</p>
      </div>

      {/* Stage 1: assumptions + derived targets */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-3">Stage 1 — target math {canEditConfig ? "(edit assumptions)" : "(assumptions)"}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Assumption label="Fellows / geo" value={config.fellowsPerGeo} step={1} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("fellowsPerGeo", v)} />
          <Assumption label="Ratio (apps:fellow)" value={config.selectionRatio} step={1} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("selectionRatio", v)} />
          <Assumption label="Lead→app" value={config.leadToApp} step={0.01} pctMode editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("leadToApp", v)} />
          <Assumption label="Reach→lead" value={config.reachToLead} step={0.01} pctMode editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("reachToLead", v)} />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Derived label="Total fellows" value={nf(targets.totalFellows)} />
          <Derived label="Applications floor" value={nf(targets.appsFloor)} tone="text-sky-700" />
          <Derived label="Leads to capture" value={nf(targets.leadsToCapture)} />
          <Derived label="People to reach" value={nf(targets.peopleToReach)} />
        </div>
      </div>

      {/* Stage 2: pre-launch tracker */}
      <FunnelTable
        title="Stage 2 — pre-launch (runs now → launch)"
        head={["Geography", "Reach target", "Reached", "%", "Lead target", "Leads", "%"]}
        rows={geos.map((g) => {
          const rp = pct(g.reachToDate, targets.perGeo.reachTarget), lp = pct(g.leadsToDate, targets.perGeo.leadTarget);
          return (
            <tr key={g.id} className="border-t border-stone-100">
              <td className="px-3 py-2 text-sm text-stone-700">{g.label}</td>
              <td className="px-3 py-2 text-right text-sm text-stone-400 tabular-nums">{nf(targets.perGeo.reachTarget)}</td>
              <td className="px-3 py-2 text-right"><input type="number" className={numInput} disabled={!g.editable || pending} defaultValue={g.reachToDate} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== g.reachToDate) saveGeo(g.id, "reachToDate", v); }} /></td>
              <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(rp)]}`}>{rp}%</td>
              <td className="px-3 py-2 text-right text-sm text-stone-400 tabular-nums">{nf(targets.perGeo.leadTarget)}</td>
              <td className="px-3 py-2 text-right"><input type="number" className={numInput} disabled={!g.editable || pending} defaultValue={g.leadsToDate} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== g.leadsToDate) saveGeo(g.id, "leadsToDate", v); }} /></td>
              <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(lp)]}`}>{lp}%</td>
            </tr>
          );
        })}
        foot={<tr className="border-t border-stone-200 bg-stone-50 font-medium">
          <td className="px-3 py-2 text-sm">Total</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{nf(targets.peopleToReach)}</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sum("reachToDate"))}</td>
          <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(pct(sum("reachToDate"), targets.peopleToReach))]}`}>{pct(sum("reachToDate"), targets.peopleToReach)}%</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{nf(targets.leadsToCapture)}</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sum("leadsToDate"))}</td>
          <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(pct(sum("leadsToDate"), targets.leadsToCapture))]}`}>{pct(sum("leadsToDate"), targets.leadsToCapture)}%</td>
        </tr>}
      />

      {/* Stage 3: applications (post-launch) */}
      <FunnelTable
        title="Stage 3 — applications (activates at launch · the 10,000 floor is met here)"
        head={["Geography", "App floor", "Received", "%", "Screened", "Shortlisted"]}
        rows={geos.map((g) => {
          const ap = pct(g.appsReceived, targets.perGeo.appFloor);
          return (
            <tr key={g.id} className="border-t border-stone-100">
              <td className="px-3 py-2 text-sm text-stone-700">{g.label}</td>
              <td className="px-3 py-2 text-right text-sm text-stone-400 tabular-nums">{nf(targets.perGeo.appFloor)}</td>
              <td className="px-3 py-2 text-right"><input type="number" className={numInput} disabled={!g.editable || pending} defaultValue={g.appsReceived} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== g.appsReceived) saveGeo(g.id, "appsReceived", v); }} /></td>
              <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(ap)]}`}>{ap}%</td>
              <td className="px-3 py-2 text-right"><input type="number" className={numInput} disabled={!g.editable || pending} defaultValue={g.screened} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== g.screened) saveGeo(g.id, "screened", v); }} /></td>
              <td className="px-3 py-2 text-right"><input type="number" className={numInput} disabled={!g.editable || pending} defaultValue={g.shortlisted} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== g.shortlisted) saveGeo(g.id, "shortlisted", v); }} /></td>
            </tr>
          );
        })}
        foot={<tr className="border-t border-stone-200 bg-stone-50 font-medium">
          <td className="px-3 py-2 text-sm">Total</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{nf(targets.appsFloor)}</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sum("appsReceived"))}</td>
          <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(pct(sum("appsReceived"), targets.appsFloor))]}`}>{pct(sum("appsReceived"), targets.appsFloor)}%</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sum("screened"))}</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sum("shortlisted"))}</td>
        </tr>}
      />
    </div>
  );
}

function Assumption({ label, value, step, pctMode, editable, pending, onSave }: { label: string; value: number; step: number; pctMode?: boolean; editable: boolean; pending: boolean; onSave: (v: number) => void }) {
  const shown = pctMode ? value : value;
  return (
    <label className="text-[11px] text-stone-500">{label}
      <input type="number" step={step} defaultValue={shown} disabled={!editable || pending}
        onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== value) onSave(v); }}
        className="mt-1 block w-full rounded border border-stone-300 px-2 py-1.5 text-sm disabled:bg-stone-50 disabled:text-stone-500 tabular-nums" />
    </label>
  );
}

function Derived({ label, value, tone = "text-stone-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-stone-50 px-3 py-2">
      <div className="text-[11px] text-stone-400">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

function FunnelTable({ title, head, rows, foot }: { title: string; head: string[]; rows: React.ReactNode[]; foot: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="text-[11px] uppercase tracking-wide text-stone-400">{head.map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>)}</tr></thead>
          <tbody>{rows}</tbody>
          <tfoot>{foot}</tfoot>
        </table>
      </div>
    </div>
  );
}
