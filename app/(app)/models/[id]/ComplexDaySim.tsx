"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hourlyAt } from "@/lib/models/daySim";
import { runComplexSim, type ComplexSimParams } from "@/lib/models/complexSim";

const C = {
  bg: "#0B2128", ground: "#0E2A33", panel: "#0E2D34", line: "#27535C",
  cyan: "#3DD6E0", cyanBr: "#6FF0E6", ink: "#DCEEF0", muted: "#6E8C92",
  amber: "#F2A65A", alert: "#F06A5A", good: "#5FD3A6", greenBr: "#7DE9BC",
  olive: "#B8C46A", pipe: "#1d4750",
};
const SVC_COLOR: Record<string, string> = { toilet: C.cyan, bath: C.cyanBr, laundry: C.olive, ro: C.good };

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
  let phase = "overnight";
  if (h === 13 || h === 14) phase = "midday service window";
  else if (h >= 6 && h <= 9) phase = "morning peak";
  else if (h >= 18 && h <= 21) phase = "evening peak";
  else if (h >= 10 && h <= 16) phase = "daytime";
  const dayish = minute > 360 && minute < 1140;

  const e = sim.econ;
  const w = sim.water;
  const anyShort = sim.services.some(s => s.demandDay > s.servedDay * 1.02);
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

  const graph = useMemo(() => buildGraph(sim), [sim]);
  const markerX = gx(minute / 60);

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
            {params.seats} WC · {params.baths} bath · {params.machines} laundry · {fmt(params.roLph)} LPH RO · {params.dewatsKld} KLD DEWATS
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 12 }}>
        {sim.services.map(s => {
          const short = s.demandDay > s.servedDay * 1.02;
          const belowCost = s.marginDay < 0;
          const util = Math.min(1.5, s.peakUtil);
          const chip = short ? "capacity short at peak" : belowCost ? "below cost — raise price" : "price covers cost ✓";
          const chipBad = short || belowCost;
          return (
            <div key={s.key} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: SVC_COLOR[s.key] }} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: s.peakUtil > 1 ? C.alert : C.muted }}>{Math.round(s.peakUtil * 100)}% peak</span>
              </div>
              <Row k="served / day" v={`${fmt(s.servedDay)} ${s.unit}`} />
              <Row k="revenue / day" v={fmtINR(s.revDay)} />
              <Row k="op cost / day" v={fmtINR(s.opDay)} />
              <Row k="margin / day" v={(s.marginDay >= 0 ? "+" : "−") + fmtINR(Math.abs(s.marginDay))} color={s.marginDay >= 0 ? C.greenBr : C.alert} />
              <div style={{ height: 5, borderRadius: 3, background: C.line, marginTop: 8, overflow: "hidden" }}>
                <i style={{ display: "block", height: "100%", width: `${Math.min(100, util * 100)}%`, background: util > 1 ? C.alert : C.cyan }} />
              </div>
              <div style={{ marginTop: 8, fontSize: 10, padding: "3px 7px", borderRadius: 5, display: "inline-block", border: `1px solid ${chipBad ? "#7a3128" : "#2c6e58"}`, color: chipBad ? C.alert : C.greenBr, background: chipBad ? "rgba(240,106,90,0.08)" : "rgba(95,211,166,0.08)" }}>
                {chip}
              </div>
            </div>
          );
        })}
        {/* monthly pass */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: C.good }} />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Monthly Pass</span>
          </div>
          <Row k="share of HH" v={`${Math.round(params.passShare * 100)}%`} />
          <Row k="revenue / day" v={fmtINR(e.passRevDay)} />
          <Row k="holders" v={`${fmt(sim.activeHH * params.passShare)} HH`} />
          <div style={{ marginTop: 8, fontSize: 10, padding: "3px 7px", borderRadius: 5, display: "inline-block", border: `1px solid #2c6e58`, color: C.greenBr, background: "rgba(95,211,166,0.08)" }}>
            covers toilet+bath+laundry use
          </div>
        </div>
      </div>

      {/* water balance strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 10 }}>
        <Mini k="Fresh water in" v={fmt(w.freshDay)} u="L/day" />
        <Mini k="Greywater made" v={fmt(w.greywaterDay)} u="L/day" />
        <Mini k="DEWATS load" v={`${Math.round(w.dewatsUtil * 100)}%`} u="of cap" color={dewOver ? C.alert : C.greenBr} />
        <Mini k="Recycled back" v={fmt(w.recycledDay)} u="L/day" color={C.greenBr} />
        <Mini k="Net fresh / user" v={fmt1(w.netFreshPerUser)} u="L" />
      </div>

      {/* economics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginTop: 10 }}>
        <Mini k="Revenue / day" v={fmtINR(e.revDay)} />
        <Mini k="Op cost / day" v={fmtINR(e.opexDay)} />
        <Mini k="Surplus / day" v={(e.surplusDay >= 0 ? "+" : "−") + fmtINR(Math.abs(e.surplusDay))} color={e.surplusDay >= 0 ? C.greenBr : C.alert} />
        <Mini k="Self-sufficiency" v={fmt1(e.oss) + "×"} />
        <Mini k="Surplus / month" v={(e.surplusMo >= 0 ? "" : "−") + fmtINR(Math.abs(e.surplusMo))} color={e.surplusMo >= 0 ? C.greenBr : C.alert} />
      </div>

      <Verdict cls={vClass} title={vTitle} body={vBody} />

      {/* 24h graph — served per hour per service */}
      <div style={{ marginTop: 14, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 14px 6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
          <span style={{ fontSize: 13 }}>Service activity across the day</span>
          <span style={{ fontSize: 10.5, color: C.muted }}>peaks shaded · lines = demand served per service</span>
        </div>
        <svg viewBox="0 0 1000 170" preserveAspectRatio="none" style={{ height: 140, width: "100%" }}>
          {[[6, 9], [18, 21]].map(([a, b], i) => (
            <rect key={i} x={gx(a)} y={12} width={gx(b) - gx(a)} height={170 - 12 - 20} fill={C.amber} opacity={0.07} />
          ))}
          {graph.lines.map(ln => <path key={ln.key} d={ln.d} fill="none" stroke={SVC_COLOR[ln.key]} strokeWidth={2} opacity={0.9} />)}
          {[0, 6, 12, 18, 24].map(hr => (
            <text key={hr} x={gx(Math.min(hr, 23.9))} y={164} fill={C.muted} fontSize={10.5} textAnchor={hr === 0 ? "start" : hr >= 24 ? "end" : "middle"}>
              {String(hr).padStart(2, "0")}:00
            </text>
          ))}
          <line x1={markerX} x2={markerX} y1={12} y2={150} stroke={C.cyanBr} strokeWidth={1.4} />
        </svg>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
          {sim.services.map(s => (
            <span key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.muted }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: SVC_COLOR[s.key] }} /> {s.name}
            </span>
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

const GW = 1000, GH = 170, PADX = 8, PADT = 12, PADB = 20;
function gx(hr: number) { return PADX + (hr / 24) * (GW - 2 * PADX); }
function buildGraph(sim: ReturnType<typeof runComplexSim>) {
  const gmax = Math.max(1, ...sim.services.flatMap(s => s.served));
  const gy = (v: number) => PADT + (1 - v / gmax) * (GH - PADT - PADB);
  const lines = sim.services.map(s => {
    let d = `M${gx(0)},${gy(s.served[0])}`;
    for (let hr = 1; hr < 24; hr++) d += ` L${gx(hr)},${gy(s.served[hr])}`;
    return { key: s.key, d };
  });
  return { lines };
}
