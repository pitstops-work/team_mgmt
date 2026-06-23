"use client";

// Friendly editor for a daySim output's config: node mapping, engine constants
// and presentation. Writes back into the output's `config` JSON (persisted by
// the template's existing Save path — no separate server action). A live
// preview renders the actual sim against template defaults so an admin sees the
// effect of every change immediately.

import { useMemo } from "react";
import type {
  ComplexSimConstants, ComplexSimPresentation,
  DaySimConfig, NodeValue, RoSimConstants, RoSimPresentation,
} from "@/lib/models/types";
import {
  complexConstants, complexPresentation, roConstants, roPresentation,
} from "@/lib/models/simConfig";
import { resolveSimParams } from "@/lib/models/simResolve";
import DaySim from "../../[id]/DaySim";
import ComplexDaySim from "../../[id]/ComplexDaySim";

export default function SimConfigEditor({
  config, setConfig, nodeKeys, values, canEdit,
}: {
  config: DaySimConfig;
  setConfig: (config: DaySimConfig) => void;
  nodeKeys: string[];
  values: Record<string, NodeValue> | null;
  canEdit: boolean;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div className="space-y-6">
        <p className="text-sm text-stone-500">
          The operations sim reads the same inputs as the finance model via the node map below.
          Engine constants and presentation used to be hardcoded — they now live here, per model.
          Changes save with the template (Save changes, top right) and appear on the model&apos;s Operations tab.
        </p>
        {config.schematic === "ro_water"
          ? <RoEditor config={config} setConfig={setConfig} nodeKeys={nodeKeys} canEdit={canEdit} />
          : <ComplexEditor config={config} setConfig={setConfig} nodeKeys={nodeKeys} canEdit={canEdit} />}
      </div>
      <div className="xl:sticky xl:top-32 self-start">
        <div className="text-xs uppercase tracking-wide text-stone-400 mb-2">Live preview · template defaults</div>
        <SimPreview config={config} values={values} />
      </div>
    </div>
  );
}

// ── Live preview ─────────────────────────────────────────────────────────────

function SimPreview({ config, values }: { config: DaySimConfig; values: Record<string, NodeValue> | null }) {
  const resolved = useMemo(() => values ? resolveSimParams(config, values) : null, [config, values]);
  if (!resolved) {
    return <div className="text-sm text-stone-400 border border-stone-200 rounded-xl p-6">Fix template validation errors to preview the sim.</div>;
  }
  if (config.schematic === "ro_water" && resolved.kind === "ro") {
    return <DaySim params={resolved.params} constants={config.constants} presentation={config.presentation} />;
  }
  if (config.schematic === "sanitation_complex" && resolved.kind === "complex") {
    return <ComplexDaySim params={resolved.params} constants={config.constants} presentation={config.presentation} />;
  }
  return null;
}

// ── RO water ─────────────────────────────────────────────────────────────────

function RoEditor({
  config, setConfig, nodeKeys, canEdit,
}: {
  config: Extract<DaySimConfig, { schematic: "ro_water" }>;
  setConfig: (c: DaySimConfig) => void; nodeKeys: string[]; canEdit: boolean;
}) {
  const K = roConstants(config.constants);
  const P = roPresentation(config.presentation);
  const setK = (patch: Partial<RoSimConstants>) => setConfig({ ...config, constants: { ...K, ...patch } });
  const setP = (patch: Partial<RoSimPresentation>) => setConfig({ ...config, presentation: { ...P, ...patch } });

  return (
    <>
      <Section title="Input mapping">
        <NodeMap nodes={config.nodes} nodeKeys={nodeKeys} canEdit={canEdit}
          onChange={(nodes) => setConfig({ ...config, nodes: nodes as typeof config.nodes })} />
      </Section>

      <Section title="Demand & operating window">
        <ProfileGrid label="Neutral 24-hour demand shape" values={K.base} disabled={!canEdit}
          onChange={(base) => setK({ base })} />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <HoursField label="Service-off hours (plant pauses)" value={K.serviceOff} disabled={!canEdit}
            onChange={(serviceOff) => setK({ serviceOff })} />
          <NumField label="Operating window opens (hour)" value={K.openHour} min={0} max={23} disabled={!canEdit}
            onChange={(openHour) => setK({ openHour })} />
        </div>
      </Section>

      <Section title="Verdict & schematic thresholds">
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Tank warn at (L)" value={P.tankWarnL} disabled={!canEdit} onChange={(tankWarnL) => setP({ tankWarnL })} />
          <NumField label="Tank critical at (L)" value={P.tankBadL} disabled={!canEdit} onChange={(tankBadL) => setP({ tankBadL })} />
          <NumField label="Tank fill turns amber at (L)" value={P.tankAmberL} disabled={!canEdit} onChange={(tankAmberL) => setP({ tankAmberL })} />
          <NumField label="Cans empty at (L)" value={P.cansEmptyL} step="any" disabled={!canEdit} onChange={(cansEmptyL) => setP({ cansEmptyL })} />
        </div>
        <BandsField label="Peak-hour shading bands" bands={P.peakBands} disabled={!canEdit}
          onChange={(peakBands) => setP({ peakBands })} />
      </Section>
    </>
  );
}

// ── Sanitation complex ───────────────────────────────────────────────────────

function ComplexEditor({
  config, setConfig, nodeKeys, canEdit,
}: {
  config: Extract<DaySimConfig, { schematic: "sanitation_complex" }>;
  setConfig: (c: DaySimConfig) => void; nodeKeys: string[]; canEdit: boolean;
}) {
  const K = complexConstants(config.constants);
  const P = complexPresentation(config.presentation);
  const setK = (patch: Partial<ComplexSimConstants>) => setConfig({ ...config, constants: { ...K, ...patch } });
  const setP = (patch: Partial<ComplexSimPresentation>) => setConfig({ ...config, presentation: { ...P, ...patch } });

  return (
    <>
      <Section title="Input mapping">
        <NodeMap nodes={config.nodes} nodeKeys={nodeKeys} canEdit={canEdit}
          onChange={(nodes) => setConfig({ ...config, nodes: nodes as typeof config.nodes })} />
      </Section>

      <Section title="Operating window & month convention">
        <div className="grid grid-cols-3 gap-3">
          <NumField label="Revenue days / month" value={K.revDaysPerMonth} disabled={!canEdit} onChange={(revDaysPerMonth) => setK({ revDaysPerMonth })} />
          <NumField label="Open window opens (hour)" value={K.openHour} min={0} max={23} disabled={!canEdit} onChange={(openHour) => setK({ openHour })} />
          <HoursField label="RO service-off hours" value={K.serviceOff} disabled={!canEdit} onChange={(serviceOff) => setK({ serviceOff })} />
        </div>
      </Section>

      <Section title="Water-use per event (litres)">
        <div className="grid grid-cols-4 gap-3">
          <NumField label="Flush" value={K.flushL} step="any" disabled={!canEdit} onChange={(flushL) => setK({ flushL })} />
          <NumField label="Handwash" value={K.handwashL} step="any" disabled={!canEdit} onChange={(handwashL) => setK({ handwashL })} />
          <NumField label="Bath" value={K.bathL} step="any" disabled={!canEdit} onChange={(bathL) => setK({ bathL })} />
          <NumField label="Laundry load" value={K.loadL} step="any" disabled={!canEdit} onChange={(loadL) => setK({ loadL })} />
        </div>
      </Section>

      <Section title="Cleaning water (litres / day)">
        <div className="grid grid-cols-4 gap-3">
          <NumField label="Baseline" value={K.cleanBase} step="any" disabled={!canEdit} onChange={(cleanBase) => setK({ cleanBase })} />
          <NumField label="Per WC seat" value={K.cleanPerSeat} step="any" disabled={!canEdit} onChange={(cleanPerSeat) => setK({ cleanPerSeat })} />
          <NumField label="Per bath cubicle" value={K.cleanPerCubicle} step="any" disabled={!canEdit} onChange={(cleanPerCubicle) => setK({ cleanPerCubicle })} />
          <NumField label="Per machine" value={K.cleanPerMachine} step="any" disabled={!canEdit} onChange={(cleanPerMachine) => setK({ cleanPerMachine })} />
        </div>
      </Section>

      <Section title="Hourly demand shapes">
        {(["toilet", "bath", "laundry", "ro"] as const).map(svc => (
          <ProfileGrid key={svc} label={svc} values={K.prof[svc]} disabled={!canEdit}
            onChange={(arr) => setK({ prof: { ...K.prof, [svc]: arr } })} />
        ))}
      </Section>

      <Section title="Schematic layout & verdict">
        <NumField label="Capacity-short flag at demand/served ratio" value={P.shortPctThreshold} step="any" disabled={!canEdit}
          onChange={(shortPctThreshold) => setP({ shortPctThreshold })} />
        <div className="mt-3 space-y-2">
          {P.services.map((s, i) => (
            <div key={s.key} className="grid grid-cols-12 gap-2 items-center">
              <span className="col-span-3 text-xs font-mono text-stone-600">{s.key}</span>
              <LabeledNum label="x" value={s.x} disabled={!canEdit}
                onChange={(x) => setP({ services: P.services.map((o, j) => j === i ? { ...o, x } : o) })} />
              <LabeledNum label="y" value={s.y} disabled={!canEdit}
                onChange={(y) => setP({ services: P.services.map((o, j) => j === i ? { ...o, y } : o) })} />
              <div className="col-span-3 flex items-center gap-1">
                <input type="color" value={s.color} disabled={!canEdit}
                  onChange={(e) => setP({ services: P.services.map((o, j) => j === i ? { ...o, color: e.target.value } : o) })}
                  className="w-7 h-7 rounded border border-stone-200 bg-transparent p-0.5" />
                <input value={s.color} disabled={!canEdit}
                  onChange={(e) => setP({ services: P.services.map((o, j) => j === i ? { ...o, color: e.target.value } : o) })}
                  className="w-full text-xs font-mono px-1 py-1 border border-stone-200 rounded outline-none focus:border-sky-400" />
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ── Shared field components ──────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <h3 className="text-sm font-medium text-stone-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function NumField({
  label, value, onChange, disabled, min, max, step,
}: {
  label: string; value: number; onChange: (n: number) => void; disabled?: boolean;
  min?: number; max?: number; step?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs text-stone-500">{label}</span>
      <input type="number" value={value} min={min} max={max} step={step ?? "1"} disabled={disabled}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
        className="mt-1 w-full text-sm px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 disabled:bg-stone-50" />
    </label>
  );
}

function LabeledNum({ label, value, onChange, disabled }: { label: string; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <label className="col-span-3 flex items-center gap-1">
      <span className="text-xs text-stone-400">{label}</span>
      <input type="number" value={value} disabled={disabled}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n); }}
        className="w-full text-xs px-1 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 disabled:bg-stone-50" />
    </label>
  );
}

/** Comma-separated list of integer hours (0–23). */
function HoursField({ label, value, onChange, disabled }: { label: string; value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs text-stone-500">{label}</span>
      <input value={value.join(", ")} disabled={disabled}
        onChange={(e) => onChange(e.target.value.split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 0 && n <= 23))}
        placeholder="e.g. 13, 14"
        className="mt-1 w-full text-sm px-2 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 disabled:bg-stone-50" />
    </label>
  );
}

/** 24 number inputs + a sparkline. Profiles are renormalised by the engine, so
 *  the absolute scale doesn't matter — only the relative shape across hours. */
function ProfileGrid({ label, values, onChange, disabled }: { label: string; values: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  const arr = values.length === 24 ? values : Array.from({ length: 24 }, (_, i) => values[i] ?? 0);
  const max = Math.max(...arr, 0.0001);
  const set = (i: number, n: number) => onChange(arr.map((v, j) => j === i ? n : v));
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-stone-500 capitalize">{label}</span>
        <svg viewBox="0 0 120 24" className="w-32 h-6" preserveAspectRatio="none">
          <polyline fill="none" stroke="#0284c7" strokeWidth="1"
            points={arr.map((v, i) => `${(i / 23) * 120},${24 - (v / max) * 22}`).join(" ")} />
        </svg>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {arr.map((v, i) => (
          <div key={i} className="flex flex-col">
            <span className="text-[9px] text-stone-300 text-center">{i}</span>
            <input type="number" step="any" value={v} disabled={disabled}
              onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(i, n); }}
              className="w-full text-[10px] px-0.5 py-0.5 border border-stone-200 rounded outline-none focus:border-sky-400 disabled:bg-stone-50 text-center" />
          </div>
        ))}
      </div>
    </div>
  );
}

function BandsField({ label, bands, onChange, disabled }: { label: string; bands: [number, number][]; onChange: (b: [number, number][]) => void; disabled?: boolean }) {
  return (
    <div className="mt-3">
      <span className="text-xs text-stone-500">{label}</span>
      <div className="mt-1 space-y-1">
        {bands.map((b, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="number" value={b[0]} min={0} max={24} disabled={disabled}
              onChange={(e) => onChange(bands.map((x, j) => j === i ? [Number(e.target.value), x[1]] : x))}
              className="w-16 text-xs px-1 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 disabled:bg-stone-50" />
            <span className="text-xs text-stone-400">to</span>
            <input type="number" value={b[1]} min={0} max={24} disabled={disabled}
              onChange={(e) => onChange(bands.map((x, j) => j === i ? [x[0], Number(e.target.value)] : x))}
              className="w-16 text-xs px-1 py-1 border border-stone-200 rounded outline-none focus:border-sky-400 disabled:bg-stone-50" />
            <button disabled={disabled} onClick={() => onChange(bands.filter((_, j) => j !== i))}
              className="text-xs text-rose-400 hover:text-rose-700 disabled:opacity-30">×</button>
          </div>
        ))}
      </div>
      <button disabled={disabled} onClick={() => onChange([...bands, [0, 0]])}
        className="mt-2 text-xs text-sky-600 hover:underline disabled:opacity-30">+ Add band</button>
    </div>
  );
}

/** Generic node-key mapping: one dropdown per param in config.nodes. Derived
 *  from the config keys, so new schematic params appear automatically. */
function NodeMap({ nodes, nodeKeys, onChange, canEdit }: {
  nodes: Record<string, string | undefined>;
  nodeKeys: string[];
  onChange: (n: Record<string, string | undefined>) => void;
  canEdit: boolean;
}) {
  const entries = Object.keys(nodes).sort();
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {entries.map(param => {
        const cur = nodes[param];
        const missing = cur && !nodeKeys.includes(cur);
        return (
          <label key={param} className="flex items-center gap-2">
            <span className="text-xs font-mono text-stone-600 w-32 shrink-0 truncate" title={param}>{param}</span>
            <select value={cur ?? ""} disabled={!canEdit}
              onChange={(e) => onChange({ ...nodes, [param]: e.target.value || undefined })}
              className={`flex-1 min-w-0 text-xs px-1 py-1 border rounded outline-none focus:border-sky-400 ${missing ? "border-rose-300 text-rose-600" : "border-stone-200"}`}>
              <option value="">(unset)</option>
              {missing && <option value={cur}>{cur} (missing)</option>}
              {nodeKeys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
        );
      })}
    </div>
  );
}
