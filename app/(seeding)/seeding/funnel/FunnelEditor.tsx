"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { pct, trackBand, type FunnelTargets } from "@/lib/seeding/funnel";
import { CENTRAL_LABEL } from "@/lib/seeding/outreach";
import { updateSeedingFunnelGeo, updateSeedingFunnelConfig, setSeedingFunnelOpening } from "../actions";
import { recomputeSeedingOutreach } from "../outreach/actions";

type Cfg = {
  fellowsPerGeo: number; selectionRatio: number; appBufferPct: number; leadToApp: number;
  coldReachToApp: number; reachToLead: number; shareFromWarm: number;
  avgReachPerSession: number; sessionsPerChannel: number; channelAgreeRate: number;
};

/** Read-time outreach counts for one geo (or the central/national bucket). */
export type OutreachCounts = {
  identified: number; contacted: number; responded: number; agreed: number; active: number; dropped: number;
  activeOrAgreed: number; total: number;
  planned: number; held: number; cancelled: number;
  sessionReach: number; sessionLeads: number;
};

type Geo = {
  id: string; key: string; label: string;
  reachToDate: number; leadsToDate: number;
  reachOpening: number; leadsOpening: number; openingNote: string | null; rollupAtISO: string | null;
  appsReceived: number; screened: number; shortlisted: number;
  outreach: OutreachCounts;
  editable: boolean;
};

const bandText = { ontrack: "text-emerald-600", warn: "text-amber-600", behind: "text-rose-600" } as const;
const nf = (n: number) => n.toLocaleString("en-IN");

export default function FunnelEditor({
  config, targets, geos, central, canEditConfig,
}: { config: Cfg; targets: FunnelTargets; geos: Geo[]; central: OutreachCounts; canEditConfig: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>) =>
    start(async () => { try { setErr(null); await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } });

  const saveGeo = (geoId: string, field: "appsReceived" | "screened" | "shortlisted", v: number) =>
    run(() => updateSeedingFunnelGeo(geoId, { [field]: v }));
  const saveOpening = (geoId: string, field: "reachOpening" | "leadsOpening", v: number) =>
    run(() => setSeedingFunnelOpening(geoId, { [field]: v }));
  const saveCfg = (field: keyof Cfg, v: number) => run(() => updateSeedingFunnelConfig({ [field]: v }));

  const sum = (f: "appsReceived" | "screened" | "shortlisted" | "reachToDate" | "leadsToDate" | "reachOpening" | "leadsOpening") =>
    geos.reduce((s, g) => s + g[f], 0);
  // Central outreach has no geo row — it counts into the totals only.
  const sumOut = (f: keyof OutreachCounts) =>
    geos.reduce((s, g) => s + g.outreach[f], 0) + central[f];

  const numInput = "w-24 text-right tabular-nums rounded border border-stone-300 px-2 py-1 text-sm disabled:bg-stone-50 disabled:text-stone-400";
  const derivedCell = "px-3 py-2 text-right text-sm tabular-nums text-stone-800";
  // Calibration: what the log actually says vs what the assumptions claim.
  const actualReachPerSession = sumOut("held") > 0 ? Math.round(sumOut("sessionReach") / sumOut("held")) : null;
  const actualLeadRate = sumOut("sessionReach") > 0 ? sumOut("sessionLeads") / sumOut("sessionReach") : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Funnel</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          Channels → sessions → reach → leads → applications. Targets are computed from the assumptions;
          reach and leads are computed from the <Link href="/seeding/outreach" className="text-sky-600 hover:underline">outreach log</Link>.
          Only the post-launch application numbers are typed by hand.
        </p>
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      {/* Stage 1: assumptions + derived targets */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <div className="text-[11px] uppercase tracking-wide text-stone-400 mb-3">Stage 1 — target math {canEditConfig ? "(edit assumptions)" : "(assumptions)"}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Assumption label="Fellows / geo" value={config.fellowsPerGeo} step={1} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("fellowsPerGeo", v)} />
          <Assumption label="Ratio (apps:fellow)" value={config.selectionRatio} step={1} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("selectionRatio", v)} />
          <Assumption label="Lead→app" value={config.leadToApp} step={0.01} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("leadToApp", v)}
            actual={actualLeadRate === null ? undefined : actualLeadRate.toFixed(2)} />
          <Assumption label="Reach→lead" value={config.reachToLead} step={0.01} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("reachToLead", v)}
            actual={actualLeadRate === null ? undefined : actualLeadRate.toFixed(2)} />
          <Assumption label="Reach / session" value={config.avgReachPerSession} step={5} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("avgReachPerSession", v)}
            actual={actualReachPerSession === null ? undefined : nf(actualReachPerSession)} />
          <Assumption label="Sessions / channel" value={config.sessionsPerChannel} step={0.1} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("sessionsPerChannel", v)} />
          <Assumption label="Channel agree rate" value={config.channelAgreeRate} step={0.05} editable={canEditConfig} pending={pending} onSave={(v) => saveCfg("channelAgreeRate", v)} />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Derived label="Channels to find" value={nf(targets.channelsToIdentify)} />
          <Derived label="Channels active" value={nf(targets.activeChannelsNeeded)} />
          <Derived label="Sessions needed" value={nf(targets.sessionsNeeded)} />
          <Derived label="People to reach" value={nf(targets.peopleToReach)} />
          <Derived label="Leads to capture" value={nf(targets.leadsToCapture)} />
          <Derived label="Applications floor" value={nf(targets.appsFloor)} tone="text-sky-700" />
          <Derived label="Total fellows" value={nf(targets.totalFellows)} />
        </div>
      </div>

      {/* Band A — the channel funnel */}
      <FunnelTable
        title="Band A — outreach channels (institutions, alumni networks, partners, forums)"
        head={["Geography", "To find", "Identified", "Contacted", "Responded", "Agreed", "Active", "% of target", "Dropped"]}
        rows={[
          ...geos.map((g) => {
            const p = pct(g.outreach.activeOrAgreed, targets.perGeo.activeChannelTarget);
            return (
              <tr key={g.id} className="border-t border-stone-100">
                <td className="px-3 py-2 text-sm text-stone-700">
                  <Link href={`/seeding/outreach/channels?geo=${g.id}`} className="hover:underline">{g.label}</Link>
                </td>
                <td className="px-3 py-2 text-right text-sm text-stone-400 tabular-nums">{nf(targets.perGeo.channelTarget)}</td>
                <td className={derivedCell}>{nf(g.outreach.identified)}</td>
                <td className={derivedCell}>{nf(g.outreach.contacted)}</td>
                <td className={derivedCell}>{nf(g.outreach.responded)}</td>
                <td className={derivedCell}>{nf(g.outreach.agreed)}</td>
                <td className={derivedCell}>{nf(g.outreach.active)}</td>
                <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(p)]}`}>{p}%</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{nf(g.outreach.dropped)}</td>
              </tr>
            );
          }),
          <CentralRow key="central" counts={central} cols={["identified", "contacted", "responded", "agreed", "active"]} trailing={central.dropped} />,
        ]}
        foot={
          <tr className="border-t border-stone-200 bg-stone-50 font-medium">
            <td className="px-3 py-2 text-sm">Total</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{nf(targets.channelsToIdentify)}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("identified"))}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("contacted"))}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("responded"))}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("agreed"))}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("active"))}</td>
            <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(pct(sumOut("activeOrAgreed"), targets.activeChannelsNeeded))]}`}>
              {pct(sumOut("activeOrAgreed"), targets.activeChannelsNeeded)}%
            </td>
            <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{nf(sumOut("dropped"))}</td>
          </tr>
        }
      />

      {/* Band B — the activity funnel */}
      <FunnelTable
        title="Band B — sessions & events"
        head={["Geography", "Sessions needed", "Planned", "Held", "%", "Reach logged", "Reach / session", "Leads logged", "Lead rate"]}
        rows={[
          ...geos.map((g) => {
            const o = g.outreach;
            const p = pct(o.held, targets.perGeo.sessionTarget);
            return (
              <tr key={g.id} className="border-t border-stone-100">
                <td className="px-3 py-2 text-sm text-stone-700">
                  <Link href={`/seeding/outreach/sessions?geo=${g.id}`} className="hover:underline">{g.label}</Link>
                </td>
                <td className="px-3 py-2 text-right text-sm text-stone-400 tabular-nums">{nf(targets.perGeo.sessionTarget)}</td>
                <td className={derivedCell}>{nf(o.planned)}</td>
                <td className={derivedCell}>{nf(o.held)}</td>
                <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(p)]}`}>{p}%</td>
                <td className={derivedCell}>{nf(o.sessionReach)}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{o.held ? nf(Math.round(o.sessionReach / o.held)) : "—"}</td>
                <td className={derivedCell}>{nf(o.sessionLeads)}</td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{o.sessionReach ? `${Math.round((o.sessionLeads / o.sessionReach) * 100)}%` : "—"}</td>
              </tr>
            );
          }),
          <CentralRow key="central" counts={central} cols={["planned", "held"]} extra={central} />,
        ]}
        foot={
          <tr className="border-t border-stone-200 bg-stone-50 font-medium">
            <td className="px-3 py-2 text-sm">Total</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{nf(targets.sessionsNeeded)}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("planned"))}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("held"))}</td>
            <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(pct(sumOut("held"), targets.sessionsNeeded))]}`}>
              {pct(sumOut("held"), targets.sessionsNeeded)}%
            </td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("sessionReach"))}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{actualReachPerSession === null ? "—" : nf(actualReachPerSession)}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sumOut("sessionLeads"))}</td>
            <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{actualLeadRate === null ? "—" : `${Math.round(actualLeadRate * 100)}%`}</td>
          </tr>
        }
      />

      {/* Band C — people (derived) */}
      <FunnelTable
        title="Band C — people reached & leads (computed from the outreach log)"
        head={["Geography", "Reach target", "Reached", "%", "Lead target", "Leads", "%"]}
        rows={geos.map((g) => {
          const rp = pct(g.reachToDate, targets.perGeo.reachTarget), lp = pct(g.leadsToDate, targets.perGeo.leadTarget);
          return (
            <tr key={g.id} className="border-t border-stone-100">
              <td className="px-3 py-2 text-sm text-stone-700">{g.label}</td>
              <td className="px-3 py-2 text-right text-sm text-stone-400 tabular-nums">{nf(targets.perGeo.reachTarget)}</td>
              <td className={derivedCell} title={`opening ${nf(g.reachOpening)} + ${g.outreach.held} held session${g.outreach.held === 1 ? "" : "s"} (${nf(g.outreach.sessionReach)})`}>
                <Link href={`/seeding/outreach/sessions?geo=${g.id}`} className="hover:underline">{nf(g.reachToDate)}</Link>
              </td>
              <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(rp)]}`}>{rp}%</td>
              <td className="px-3 py-2 text-right text-sm text-stone-400 tabular-nums">{nf(targets.perGeo.leadTarget)}</td>
              <td className={derivedCell} title={`opening ${nf(g.leadsOpening)} + ${nf(g.outreach.sessionLeads)} from sessions`}>{nf(g.leadsToDate)}</td>
              <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(lp)]}`}>{lp}%</td>
            </tr>
          );
        })}
        foot={<tr className="border-t border-stone-200 bg-stone-50 font-medium">
          <td className="px-3 py-2 text-sm">Total</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{nf(targets.peopleToReach)}</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sum("reachToDate") + central.sessionReach)}</td>
          <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(pct(sum("reachToDate") + central.sessionReach, targets.peopleToReach))]}`}>{pct(sum("reachToDate") + central.sessionReach, targets.peopleToReach)}%</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-500">{nf(targets.leadsToCapture)}</td>
          <td className="px-3 py-2 text-right text-sm tabular-nums">{nf(sum("leadsToDate") + central.sessionLeads)}</td>
          <td className={`px-3 py-2 text-right text-sm tabular-nums ${bandText[trackBand(pct(sum("leadsToDate") + central.sessionLeads, targets.leadsToCapture))]}`}>{pct(sum("leadsToDate") + central.sessionLeads, targets.leadsToCapture)}%</td>
        </tr>}
      />

      {/* Opening balances — the one-time carry-forward, kept visible and auditable */}
      <details className="rounded-xl border border-stone-200 bg-white overflow-hidden">
        <summary className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700 cursor-pointer">
          Opening balances {canEditConfig ? "(central — edit)" : "(central only)"}
        </summary>
        <p className="px-4 pt-3 text-[11px] text-stone-400">
          The hand-typed reach and lead numbers from before the outreach log existed. Band C shows opening + logged sessions,
          so nothing was lost when the funnel became derived. Correct these rather than editing Band C.
        </p>
        <div className="overflow-x-auto mt-1">
          <table className="w-full">
            <thead><tr className="text-[11px] uppercase tracking-wide text-stone-400">
              <th className="px-3 py-2 font-medium text-left">Geography</th>
              <th className="px-3 py-2 font-medium text-right">Reach opening</th>
              <th className="px-3 py-2 font-medium text-right">Leads opening</th>
              <th className="px-3 py-2 font-medium text-right">Last recomputed</th>
            </tr></thead>
            <tbody>
              {geos.map((g) => (
                <tr key={g.id} className="border-t border-stone-100">
                  <td className="px-3 py-2 text-sm text-stone-700">{g.label}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" className={numInput} disabled={!canEditConfig || pending} defaultValue={g.reachOpening}
                      onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== g.reachOpening) saveOpening(g.id, "reachOpening", v); }} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" className={numInput} disabled={!canEditConfig || pending} defaultValue={g.leadsOpening}
                      onBlur={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v !== g.leadsOpening) saveOpening(g.id, "leadsOpening", v); }} />
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-stone-400">
                    {g.rollupAtISO ? new Date(g.rollupAtISO).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEditConfig && (
          <div className="px-4 py-3 border-t border-stone-100">
            <button type="button" disabled={pending} onClick={() => run(() => recomputeSeedingOutreach())}
              className="text-xs text-sky-600 hover:underline disabled:text-stone-400">
              Recompute all outreach rollups
            </button>
            <span className="text-[11px] text-stone-400 ml-2">Repairs Band C if anything was ever changed outside the app.</span>
          </div>
        )}
      </details>

      {/* Band D: applications (post-launch, still typed) */}
      <FunnelTable
        title="Band D — applications (activates at launch · the 10,000 floor is met here)"
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

/** Central/national outreach has no geo row — it shows as its own line and
 *  counts into the totals only, so per-geo targets stay honest. */
function CentralRow({ counts, cols, trailing, extra }: { counts: OutreachCounts; cols: (keyof OutreachCounts)[]; trailing?: number; extra?: OutreachCounts }) {
  return (
    <tr className="border-t border-stone-100 bg-stone-50/60">
      <td className="px-3 py-2 text-sm text-stone-500 italic">{CENTRAL_LABEL}</td>
      <td className="px-3 py-2 text-right text-sm text-stone-300 tabular-nums">—</td>
      {cols.map((c) => <td key={c} className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(counts[c])}</td>)}
      <td className="px-3 py-2 text-right text-sm text-stone-300 tabular-nums">—</td>
      {trailing !== undefined && <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{nf(trailing)}</td>}
      {extra && <>
        <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(extra.sessionReach)}</td>
        <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{extra.held ? nf(Math.round(extra.sessionReach / extra.held)) : "—"}</td>
        <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-600">{nf(extra.sessionLeads)}</td>
        <td className="px-3 py-2 text-right text-sm tabular-nums text-stone-400">{extra.sessionReach ? `${Math.round((extra.sessionLeads / extra.sessionReach) * 100)}%` : "—"}</td>
      </>}
    </tr>
  );
}

function Assumption({ label, value, step, editable, pending, onSave, actual }: { label: string; value: number; step: number; editable: boolean; pending: boolean; onSave: (v: number) => void; actual?: string }) {
  return (
    <label className="text-[11px] text-stone-500">{label}
      <input type="number" step={step} defaultValue={value} disabled={!editable || pending}
        onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== value) onSave(v); }}
        className="mt-1 block w-full rounded border border-stone-300 px-2 py-1.5 text-sm disabled:bg-stone-50 disabled:text-stone-500 tabular-nums" />
      {actual !== undefined && <span className="block mt-0.5 text-[10px] text-stone-400">actual so far: {actual}</span>}
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
