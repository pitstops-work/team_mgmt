"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hourlyAt } from "@/lib/models/daySim";
import { runComplexSim, type ComplexService, type ComplexSimParams } from "@/lib/models/complexSim";

const C = {
  bg: "#0B2128", ground: "#0E2A33", panel: "#0E2D34", line: "#27535C",
  cyan: "#3DD6E0", cyanBr: "#6FF0E6", ink: "#DCEEF0", muted: "#6E8C92",
  amber: "#F2A65A", alert: "#F06A5A", good: "#5FD3A6", greenBr: "#7DE9BC",
  olive: "#B8C46A", pipe: "#1d4750",
};
// Distinct hues per service — was toilet/bath both cyan, indistinguishable.
const SVC_COLOR: Record<string, string> = { toilet: C.cyan, bath: C.amber, laundry: C.olive, ro: C.good };

const fmt = (n: number) => Math.round(n).toLocaleString("en-IN");
const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-IN");
const SPEED = 1440 / 24000;

export default function ComplexDaySim({ params }: { params: ComplexSimParams }) {
  const sim = useMemo(
    () => runComplexSim(params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    Object.values(params),
  );

  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(true);
  const lastRef = useRef<number | null>(null);
  const minuteRef = useRef(0);
  minuteRef.current = minute;

  useEffect(() => {
    if (!playing) { lastRef.current = null; return; }
    let raf = 0;
    const loop = (ts: number) => {
      if (lastRef.current == null) lastRef.current = ts;
      const dt = ts - lastRef.current;
      lastRef.current = ts;
      let m = minuteRef.current + dt * SPEED;
      if (m >= 1440) m = 0;
      setMinute(m);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const reduce = useMemo(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);

  const h = Math.min(23, Math.floor(minute / 60));
  const mm = Math.floor(minute % 60);
  const clock = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const facilityOpen = params.facilityOpenHours >= 24 ? true : ((h - 6 + 24) % 24) < params.facilityOpenHours;
  let phase = "overnight";
  if (h === 13 || h === 14) phase = "midday service window";
  else if (h >= 6 && h <= 9) phase = "morning peak";
  else if (h >= 18 && h <= 21) phase = "evening peak";
  else if (h >= 10 && h <= 16) phase = "daytime";
  if (!facilityOpen) phase = "complex closed";
  const dayish = minute > 360 && minute < 1140;

  const e = sim.econ;
  const w = sim.water;
  // Threshold: ≥5% of demand lost at peak counts as a real bottleneck. Below
  // that, a small peak-hour queue is operational reality, not a design flaw.
  const anyShort = sim.services.some(s => s.demandDay > s.servedDay * 1.05);
  const dewOver = w.dewatsUtil > 1;

  let vClass: "good" | "warn" | "bad" = "good";
  let vTitle = "Healthy";
  let vBody = "every service copes at peak, costs are covered, and greywater recycling is within DEWATS limits.";
  if (e.surplusDay < 0) {
    vClass = "bad"; vTitle = "Running at a daily loss";
    vBody = "revenue doesn't cover operating cost — raise prices, lift adoption, or trim a vertical.";
  } else if (anyShort || dewOver) {
    vClass = "warn"; vTitle = "Surplus, but a capacity pinch";
    vBody = (dewOver ? "DEWATS is overloaded — greywater exceeds treatment capacity. " : "") + (anyShort ? "At least one service queues at peak — add units or spread the peak." : "");
  }

  const flowStyle = (on: boolean, color: string): React.CSSProperties => ({
    stroke: color, strokeWidth: 3.4, fill: "none", strokeLinecap: "round",
    strokeDasharray: "2 14", opacity: on ? 0.9 : 0.07,
    animation: on && !reduce ? `csim-dash 1s linear infinite` : "none",
  });

  // households activity (sum of services this hour, scaled)
  const svcHourSum = sim.services.reduce((a, s) => a + hourlyAt(s.served, minute) / (Math.max(...s.served) || 1), 0);

  return (
    <div style={{ background: C.bg, color: C.ink, borderRadius: 16, border: `1px solid ${C.line}`, padding: 18, fontFamily: "var(--font-mono, ui-monospace), monospace" }}>
      <style>{`@keyframes csim-dash{to{stroke-dashoffset:-160}}`}</style>

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", borderBottom: `1px solid ${C.line}`, paddingBottom: 12, marginBottom: 14 }}>
        <div>
          <div style={{ color: C.cyan, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em" }}>Live operations · full complex · 24-hour cycle</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, fontFamily: "var(--font-sans, system-ui), sans-serif" }}>Sanitation Complex — day in the life</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            {params.seats} WC · {params.baths} bath · {params.machines} laundry · {fmt(params.roLph)} LPH RO · {params.dewatsKld} KLD DEWATS · open {params.facilityOpenHours >= 24 ? "24h" : `${Math.round(params.facilityOpenHours)}h`}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: C.cyanBr, fontVariantNumeric: "tabular-nums" }}>{clock}</div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.13em", textTransform: "uppercase", marginTop: 5 }}>{phase}</div>
        </div>
      </div>

      {/* schematic */}
      <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.ground})`, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
        <svg viewBox="0 0 1000 300" style={{ display: "block", width: "100%", height: "auto" }} role="img" aria-label="Sanitation complex daily operation schematic">
          <rect x="0" y="0" width="1000" height="36" fill={dayish ? "#1e4a5e" : "#0a1a2a"} />
          <circle cx={60 + (minute / 1440) * 880} cy="20" r="9" fill={dayish ? "#F2C879" : "#cdd9e0"} opacity={dayish ? 0.9 : 0.7} />
          <text x="20" y="24" fill="#9fb6bd" fontSize="11">{dayish ? "day" : "night"}</text>

          {/* fresh source */}
          <text x={70} y={72} textAnchor="middle" fill={C.muted} fontSize="11">FRESH · BWSSB</text>
          <rect x={34} y={80} width={72} height={150} rx={8} fill="#0a2026" stroke="#2c5a64" strokeWidth={2} />
          <rect x={36} y={82} width={68} height={146} fill="#2a8d96" opacity={0.55} />
          <path d="M106,150 H150" style={flowStyle(true, C.cyan)} />

          {/* service blocks */}
          {SVC_POS.map(pos => {
            const s = sim.services.find(x => x.key === pos.key)!;
            const sh = hourlyAt(s.served, minute);
            const peakH = s.capPerHour > 0 && sh >= s.capPerHour - 0.01;
            const n = Math.max(0, Math.min(12, Math.round((sh / (Math.max(...s.served) || 1)) * 12)));
            return (
              <g key={pos.key}>
                <rect x={pos.x} y={pos.y} width={130} height={84} rx={8} fill="#0c2930" stroke={C.line} strokeWidth={2} />
                <text x={pos.x + 12} y={pos.y + 20} fill={C.muted} fontSize={11}>{s.name.toUpperCase()}</text>
                <g>
                  {Array.from({ length: n }).map((_, i) => (
                    <circle key={i} cx={pos.x + 16 + (i % 6) * 16} cy={pos.y + 36 + Math.floor(i / 6) * 16} r={4}
                      fill={peakH ? C.alert : SVC_COLOR[pos.key]} opacity={0.85} />
                  ))}
                </g>
                <text x={pos.x + 12} y={pos.y + 76} fill={C.ink} fontSize={12} fontWeight={600}>
                  {fmt(sh)} {s.unit === "L" ? "L/h" : "/h"}
                </text>
              </g>
            );
          })}

          {/* DEWATS */}
          <g>
            <rect x={490} y={185} width={170} height={84} rx={8} fill="#0c2930" stroke={dewOver ? C.alert : "#3a6e4a"} strokeWidth={2} />
            <text x={502} y={205} fill={C.muted} fontSize={11}>DEWATS · {params.dewatsKld} KLD</text>
            <rect x={502} y={216} width={146} height={8} rx={4} fill={C.line} />
            <rect x={502} y={216} width={Math.min(146, 146 * w.dewatsUtil)} height={8} rx={4} fill={dewOver ? C.alert : C.greenBr} />
            <text x={502} y={250} fill={C.ink} fontSize={12} fontWeight={600}>{Math.round(w.dewatsUtil * 100)}% load</text>
          </g>
          {/* greywater services → DEWATS, recycled DEWATS → toilets */}
          <path d="M575,144 V185" style={flowStyle(true, C.olive)} />
          <path d="M490,227 H300 V144" style={flowStyle(w.recycledDay > 0, C.good)} />

          {/* households */}
          <text x={770} y={72} textAnchor="middle" fill={C.muted} fontSize="11">HOUSEHOLDS</text>
          <g>
            {Array.from({ length: Math.max(1, Math.min(16, Math.round(svcHourSum * 4))) }).map((_, i) => (
              <circle key={i} cx={720 + (i % 5) * 22} cy={92 + Math.floor(i / 5) * 20} r={4.5} fill={C.cyan} opacity={0.8} />
            ))}
          </g>
          <text x={770} y={210} textAnchor="middle" fill={C.muted} fontSize={11}>{fmt(sim.activeHH)} active HH</text>
        </svg>
      </div>

      {/* per-service cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
        {sim.services.map(s => {
          const short = s.demandDay > s.servedDay * 1.05;
          const belowCost = s.marginDay < 0;
          const util = Math.min(1.5, s.peakUtil);
          // Spare-capacity hint: when peak utilisation is well under 100%,
          // throughput sliders can't move served/day (no bottleneck). Surface
          // this so the slider doesn't feel dead. Subordinates to "short" and
          // "below cost" — those are more actionable.
          const spareCap = !short && s.peakUtil > 0 && s.peakUtil < 0.9;
          const chip = short ? "capacity short at peak"
            : belowCost ? "below cost — raise price"
            : spareCap ? "spare capacity — throughput moot"
            : "price covers cost ✓";
          const chipBad = short || belowCost;
          const chipNeutral = !chipBad && spareCap;
          const chipBorder = chipBad ? "#7a3128" : chipNeutral ? C.line : "#2c6e58";
          const chipColor = chipBad ? C.alert : chipNeutral ? C.muted : C.greenBr;
          const chipBg = chipBad ? "rgba(240,106,90,0.08)" : chipNeutral ? "rgba(110,140,146,0.08)" : "rgba(95,211,166,0.08)";
          return (
            <div key={s.key} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: SVC_COLOR[s.key] }} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: s.peakUtil > 1 ? C.alert : C.muted }}>{Math.round(s.peakUtil * 100)}% peak</span>
              </div>
              <Row k="served / day" v={`${fmt(s.servedDay)} ${s.unit}`} />
              <Row k="revenue / day" v={fmtINR(s.revDay)} />
              {s.revPassDay > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, margin: "1px 0 1px 8px", color: C.muted }}>
                  <span>↳ per-use / pass</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtINR(s.revUseDay)} · {fmtINR(s.revPassDay)}</span>
                </div>
              )}
              <Row k="op cost / day" v={fmtINR(s.opDay)} />
              <Row k="margin / day" v={(s.marginDay >= 0 ? "+" : "−") + fmtINR(Math.abs(s.marginDay))} color={s.marginDay >= 0 ? C.greenBr : C.alert} />
              <div style={{ height: 5, borderRadius: 3, background: C.line, marginTop: 8, overflow: "hidden" }}>
                <i style={{ display: "block", height: "100%", width: `${Math.min(100, util * 100)}%`, background: util > 1 ? C.alert : C.cyan }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 10, padding: "3px 7px", borderRadius: 5, display: "inline-block", border: `1px solid ${chipBorder}`, color: chipColor, background: chipBg }}>
                {chip}
              </div>
            </div>
          );
        })}
        {/* monthly pass — informational; income is already allocated into the
            toilet/bath/laundry cards by served-value share, so we don't double-count. */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C.good }} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Monthly Pass</span>
          </div>
          <Row k="share of HH" v={`${Math.round(params.passShare * 100)}%`} />
          <Row k="revenue / day" v={fmtINR(e.passRevDay)} />
          <Row k="holders" v={`${fmt(sim.activeHH * params.passShare)} HH`} />
          <div style={{ marginTop: 8, fontSize: 10, padding: "3px 7px", borderRadius: 5, display: "inline-block", border: `1px solid ${C.line}`, color: C.muted, background: "rgba(110,140,146,0.08)" }}>
            allocated into toilet+bath+laundry above
          </div>
        </div>
      </div>

      {/* water balance strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 10 }}>
        <Mini k="Fresh water in" v={fmt(w.freshDay)} u="L/day" />
        <Mini k="Greywater made" v={fmt(w.greywaterDay)} u="L/day" />
        <Mini k="DEWATS load" v={`${Math.round(w.dewatsUtil * 100)}%`} u="of cap" color={dewOver ? C.alert : C.greenBr} />
        <Mini k="Recycled back" v={fmt(w.recycledDay)} u="L/day" color={C.greenBr} />
        <Mini k="Net fresh / user" v={fmt1(w.netFreshPerUser)} u="L" />
      </div>

      {/* economics — daily op metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginTop: 10 }}>
        <Mini k="Revenue / day" v={fmtINR(e.revDay)} />
        <Mini k="Op cost / day" v={fmtINR(e.opexDay)} />
        <Mini k="Surplus / day" v={(e.surplusDay >= 0 ? "+" : "−") + fmtINR(Math.abs(e.surplusDay))} color={e.surplusDay >= 0 ? C.greenBr : C.alert} />
        <Mini k="Self-sufficiency" v={fmt1(e.oss) + "×"} />
      </div>
      {/* economics — monthly rollup. Surplus/mo uses 28 working days (matches the
          finance model). Community surplus subtracts the replacement reserve so
          you see what's actually free to spend vs earmarked for asset renewal. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 10 }}>
        <Mini k="Revenue / month" v={fmtINR(e.revMo)} />
        <Mini k="Surplus / month" v={(e.surplusMo >= 0 ? "" : "−") + fmtINR(Math.abs(e.surplusMo))} color={e.surplusMo >= 0 ? C.greenBr : C.alert} />
        <Mini k="Replacement reserve" v={fmtINR(e.reserveMo) + "/mo"} color={C.muted} />
        <Mini k="Community surplus" v={(e.communitySurplusMo >= 0 ? "" : "−") + fmtINR(Math.abs(e.communitySurplusMo)) + "/mo"} color={e.communitySurplusMo >= 0 ? C.greenBr : C.alert} />
      </div>

      <Verdict cls={vClass} title={vTitle} body={vBody} />

      {/* 24h graphs — per-service demand vs supply. Demand (dashed, faint) and
          served (solid, bright) are plotted per service in their own panel so
          y-scales don't collide (RO is L/h, toilets/baths/loads are counts).
          Shaded gap between demand and served = lost demand at peak. */}
      <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 14px 10px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontSize: 13 }}>Demand vs supply across the day</span>
          <span style={{ fontSize: 10.5, color: C.muted }}>solid = served · dashed = demand · shaded gap = lost at peak · peaks tinted amber</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {sim.services.map(s => (
            <ServiceGraph key={s.key} s={s} markerMinute={minute} />
          ))}
        </div>
      </div>

      {/* controls */}
      <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 16px", display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => { setPlaying(p => !p); lastRef.current = null; }}
          style={{ background: C.cyan, color: "#06222a", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          {playing ? "Pause" : "Play"}
        </button>
        <button onClick={() => setMinute(0)}
          style={{ background: "transparent", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontFamily: "inherit" }}>
          Restart day
        </button>
        <div style={{ flex: 1, minWidth: 170, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: C.muted }}>00:00</span>
          <input type="range" min={0} max={1440} step={1} value={minute}
            onChange={ev => { setPlaying(false); setMinute(Number(ev.target.value)); }}
            style={{ flex: 1, accentColor: C.cyan }} aria-label="Time of day" />
          <span style={{ fontSize: 11, color: C.muted }}>24:00</span>
        </div>
      </div>

      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, marginTop: 14, borderLeft: `2px solid ${C.line}`, paddingLeft: 13 }}>
        Each service serves up to its capacity (seats, cubicles, machines, plant), so a sharp peak or too few units makes
        it queue (red chip). Water from bathing, laundry, handwash and the RO reject becomes greywater, which DEWATS
        treats (up to its KLD limit) and returns as recycled flush + cleaning water — cutting fresh demand. Per-day
        economics use the finance model&apos;s monthly opex (÷30); the monthly pass spreads one fee across
        toilet+bath+laundry, which is why per-use revenue is discounted by the pass share.
      </p>
    </div>
  );
}

const SVC_POS = [
  { key: "toilet", x: 150, y: 60 },
  { key: "bath", x: 310, y: 60 },
  { key: "laundry", x: 470, y: 60 },
  { key: "ro", x: 150, y: 185 },
] as const;

function Row({ k, v, color }: { k: string; v: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, margin: "3px 0" }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: color ?? C.ink, fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}
function Mini({ k, v, u, color }: { k: string; v: string; u?: string; color?: string }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 9, padding: "10px 11px" }}>
      <div style={{ fontSize: 9.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{k}</div>
      <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6, fontVariantNumeric: "tabular-nums", color: color ?? C.ink }}>
        {v} {u && <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>{u}</span>}
      </div>
    </div>
  );
}
function Verdict({ cls, title, body }: { cls: "good" | "warn" | "bad"; title: string; body: string }) {
  const dot = cls === "bad" ? C.alert : cls === "warn" ? C.amber : C.good;
  return (
    <div style={{ marginTop: 13, borderRadius: 10, padding: "12px 15px", fontSize: 14, border: `1px solid ${C.line}`, background: C.panel, display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ width: 11, height: 11, borderRadius: "50%", background: dot, flex: "none", boxShadow: `0 0 0 4px ${dot}26` }} />
      <div><b style={{ fontWeight: 600 }}>{title}</b> <span style={{ color: C.muted }}>— {body}</span></div>
    </div>
  );
}

/** Top-5 demand hours collapsed into contiguous bands. Used to amber-tint the
 *  per-service graph at the hours that actually matter for THIS service, given
 *  the current peak_concentration and facility_open_hours. */
function peakHourBands(demand: number[]): Array<[number, number]> {
  const indexed = demand.map((v, h) => ({ h, v })).sort((a, b) => b.v - a.v).slice(0, 5).map(x => x.h).sort((a, b) => a - b);
  if (indexed.length === 0) return [];
  const bands: Array<[number, number]> = [];
  let start = indexed[0], prev = indexed[0];
  for (let i = 1; i < indexed.length; i++) {
    if (indexed[i] === prev + 1) prev = indexed[i];
    else { bands.push([start, prev + 1]); start = indexed[i]; prev = indexed[i]; }
  }
  bands.push([start, prev + 1]);
  return bands;
}

/** Per-service 24h panel: demand (dashed) vs served (solid) with shaded
 *  lost-demand gap, peak-hour amber tinting, and a now-marker line that
 *  tracks the playhead minute. Each panel auto-scales to its own service's
 *  magnitude (RO is L/h, others are counts) so they're not crushed by RO. */
function ServiceGraph({ s, markerMinute }: { s: ComplexService; markerMinute: number }) {
  const GW = 240, GH = 110, PADX = 4, PADT = 8, PADB = 18;
  const gx = (hr: number) => PADX + (hr / 24) * (GW - 2 * PADX);
  const yMax = Math.max(1, ...s.demand, s.capPerHour); // cap line stays visible too
  const gy = (v: number) => PADT + (1 - v / yMax) * (GH - PADT - PADB);
  const path = (vals: number[]) => {
    let d = `M${gx(0)},${gy(vals[0])}`;
    for (let hr = 1; hr < 24; hr++) d += ` L${gx(hr)},${gy(vals[hr])}`;
    return d;
  };
  // Filled gap = lost demand. Closed polygon from demand down to served.
  const gapPath = (() => {
    let d = `M${gx(0)},${gy(s.demand[0])}`;
    for (let hr = 1; hr < 24; hr++) d += ` L${gx(hr)},${gy(s.demand[hr])}`;
    for (let hr = 23; hr >= 0; hr--) d += ` L${gx(hr)},${gy(s.served[hr])}`;
    return d + " Z";
  })();
  const capY = gy(s.capPerHour);
  const colour = SVC_COLOR[s.key];
  const markerX = gx(markerMinute / 60);
  return (
    <div style={{ background: C.ground, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px 4px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span style={{ width: 9, height: 9, borderRadius: 2, background: colour }} />
        <span style={{ fontSize: 11.5, fontWeight: 600 }}>{s.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: C.muted, fontVariantNumeric: "tabular-nums" }}>
          {fmt(s.servedDay)} / {fmt(s.demandDay)} {s.unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${GW} ${GH}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: 96 }}>
        {/* Peak-hour tint — derived from this service's actual demand profile
            (top 5 hours), so it tracks peak_concentration + facility_open_hours
            rather than a hardcoded morning/evening window. */}
        {peakHourBands(s.demand).map(([a, b], i) => (
          <rect key={i} x={gx(a)} y={PADT} width={Math.max(1, gx(b) - gx(a))} height={GH - PADT - PADB} fill={C.amber} opacity={0.06} />
        ))}
        {/* cap-line — capacity-per-hour reference */}
        {s.capPerHour > 0 && capY >= PADT && capY <= GH - PADB && (
          <line x1={PADX} x2={GW - PADX} y1={capY} y2={capY} stroke={C.line} strokeWidth={1} strokeDasharray="2 3" />
        )}
        {/* lost-demand shaded gap */}
        <path d={gapPath} fill={C.alert} opacity={0.16} />
        {/* demand: dashed, faint */}
        <path d={path(s.demand)} fill="none" stroke={colour} strokeWidth={1.4} strokeDasharray="3 3" opacity={0.55} />
        {/* served: solid, bright */}
        <path d={path(s.served)} fill="none" stroke={colour} strokeWidth={2.2} opacity={0.95} />
        {/* hour labels */}
        {[0, 6, 12, 18, 24].map(hr => (
          <text key={hr} x={gx(Math.min(hr, 23.99))} y={GH - 4} fill={C.muted} fontSize={9}
            textAnchor={hr === 0 ? "start" : hr >= 24 ? "end" : "middle"}>{String(hr).padStart(2, "0")}</text>
        ))}
        {/* now-marker */}
        <line x1={markerX} x2={markerX} y1={PADT} y2={GH - PADB} stroke={C.cyanBr} strokeWidth={1.2} opacity={0.7} />
      </svg>
    </div>
  );
}
