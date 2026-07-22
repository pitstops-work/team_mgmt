"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hourlyAt, levelAt, runDaySim, type DaySimParams } from "@/lib/models/daySim";
import type { RoSimConstants, RoSimPresentation } from "@/lib/models/types";
import { roConstants, roPresentation } from "@/lib/models/simConfig";

// Dark "operations" palette (matches the ATM-01 prototype).
const C = {
  bg: "#0B2128", ground: "#0E2A33", panel: "#0E2D34", line: "#27535C",
  cyan: "#3DD6E0", cyanBr: "#6FF0E6", ink: "#DCEEF0", muted: "#6E8C92",
  amber: "#F2A65A", alert: "#F06A5A", good: "#5FD3A6", pipe: "#1d4750",
};

const fmtL = (n: number) => Math.round(n).toLocaleString("en-IN");
const fmtINR = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-IN");
const SPEED = 1440 / 24000; // one day in ~24s

export default function DaySim({ params, constants, presentation }: {
  params: DaySimParams;
  constants?: Partial<RoSimConstants>;
  presentation?: Partial<RoSimPresentation>;
}) {
  const P = useMemo(() => roPresentation(presentation), [presentation]);
  const K = useMemo(() => roConstants(constants), [constants]);
  const offSet = useMemo(() => new Set(K.serviceOff), [K]);
  const constantsKey = JSON.stringify(constants);
  const sim = useMemo(
    () => runDaySim(params, constants),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.lph, params.tankCap, params.cansCount, params.hh, params.adoption, params.lpd, params.peak, params.price, params.opexMonthly, params.operatingHours, params.operatingDays, constantsKey],
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

  const reduce = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(() => { if (reduce) setPlaying(false); }, [reduce]);

  // ── Derived state at the current minute ──────────────────────────────────
  const h = Math.min(23, Math.floor(minute / 60));
  const mm = Math.floor(minute % 60);
  const clock = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  const dem = hourlyAt(sim.demands, minute);
  const prod = hourlyAt(sim.prods, minute);
  const unmetNow = hourlyAt(sim.unmets, minute);
  const tank = levelAt(sim.tankLevels, minute);
  const cans = levelAt(sim.canLevels, minute);
  const dispensed = hourlyAt(sim.dispensedCum, minute);
  const unmetTot = hourlyAt(sim.unmetCum, minute);
  const plantOn = prod > 0;
  const tankFrac = params.tankCap > 0 ? Math.max(0, Math.min(1, tank / params.tankCap)) : 0;
  const cansFrac = sim.cansL > 0 ? Math.max(0, Math.min(1, cans / sim.cansL)) : 0;

  const [bMorn, bEve] = P.peakBands;
  const cansLowL = P.cansEmptyL;
  let phase = "overnight · banking";
  if (offSet.has(h)) phase = "midday · plant service";
  else if (bMorn && h >= bMorn[0] && h <= bMorn[1]) phase = "morning peak";
  else if (bEve && h >= bEve[0] && h <= bEve[1]) phase = "evening peak";
  else if (bMorn && bEve && h > bMorn[1] && h < bEve[0]) phase = "daytime · steady";

  // Can-reserve dynamics at the current hour. The engine banks tank overflow
  // into the cans off-peak (charge) and draws them down when the tank is
  // exhausted at the rush (drain); surface those as distinct states.
  const cansPrev = sim.canLevels[h] ?? 0;
  const cansNext = sim.canLevels[Math.min(h + 1, 24)] ?? cansPrev;
  const hasCans = sim.cansL > 0;
  const cansCharging = hasCans && cansNext > cansPrev + 0.5;
  const cansDraining = hasCans && cansNext < cansPrev - 0.5;
  const cansFull = hasCans && cans >= sim.cansL * 0.99;

  // Verdict
  let vClass: "good" | "warn" | "bad" = "good";
  let vTitle: string;
  let vBody: string;
  if (!plantOn) {
    vTitle = "Plant on service";
    vBody = "running on stored water during the maintenance window.";
  } else if (cansCharging && !cansFull) {
    vTitle = "Filling the reserve";
    vBody = "production is outrunning demand — the overflow is topping the pre-packed cans back up.";
  } else if (hasCans && cansFull) {
    vTitle = "Fully banked";
    vBody = "tank and can reserve are both full — ready to absorb the next peak.";
  } else {
    vTitle = "Tank holding";
    vBody = "production and demand are balanced; the tank is steady.";
  }
  if (unmetTot > 0 || (tank <= P.tankBadL && cans <= cansLowL)) {
    vClass = "bad"; vTitle = "Shortfall — queue forming";
    vBody = "tank and pre-packed cans are both exhausted. Add cans, spread the peak, or add storage.";
  } else if (tank <= P.tankWarnL && cans > cansLowL) {
    vClass = "warn"; vTitle = "On the can reserve";
    vBody = "tank is low at peak — pre-packed cans are covering the gap. This is what they're for.";
  } else if (tank <= P.tankWarnL) {
    vClass = "warn"; vTitle = "Tank running low";
    vBody = "peak draw is biting into the buffer with little can reserve left.";
  }

  // Economics verdict
  const e = sim.econ;
  let ecClass: "good" | "warn" | "bad" = "good";
  let ecT = "Self-sustaining";
  let ecB = `price covers all costs, leaves ${fmtINR(e.surplusMo)}/mo surplus, and supply meets demand all day.`;
  if (e.surplusDay < 0) {
    ecClass = "bad"; ecT = "Loss at this price";
    ecB = "revenue doesn't cover the monthly operating cost — raise the price or lift volume.";
  } else if (unmetTot > 0 || sim.unmetCum[sim.unmetCum.length - 1] > 0) {
    ecClass = "warn"; ecT = "Surplus but water short";
    ecB = "costs are covered, but the tank/cans run dry at peak — fix capacity before handover.";
  }

  const dayish = minute > 360 && minute < 1140;
  const sky = skyFor(minute);

  // Static graph geometry (depends only on sim/tankCap).
  const graph = useMemo(() => buildGraph(sim, params.tankCap), [sim, params.tankCap]);
  const markerX = gx(minute / 60);
  const markerY = graphY(levelAt(sim.tankLevels, minute), params.tankCap);

  const flowStyle = (on: boolean, dur: number): React.CSSProperties => ({
    strokeDasharray: "2 14",
    opacity: on ? 0.9 : 0.08,
    animation: on && !reduce ? `dsim-dash ${dur}s linear infinite` : "none",
  });

  return (
    <div style={{ background: C.bg, color: C.ink, borderRadius: 16, border: `1px solid ${C.line}`, padding: 18, fontFamily: "var(--font-mono, ui-monospace), monospace" }}>
      <style>{`@keyframes dsim-dash{to{stroke-dashoffset:-160}}`}</style>

      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", borderBottom: `1px solid ${C.line}`, paddingBottom: 12, marginBottom: 14 }}>
        <div>
          <div style={{ color: C.cyan, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.18em" }}>Live plant telemetry · 24-hour cycle</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4, fontFamily: "var(--font-sans, system-ui), sans-serif" }}>RO Water — day in the life</div>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
            {fmtL(params.lph)} L/h RO · {fmtL(params.tankCap)} L tank · {params.cansCount} cans · {params.operatingHours >= 24 ? "24h" : `${Math.round(params.operatingHours)}h/day from 6am`}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1, color: C.cyanBr, fontVariantNumeric: "tabular-nums" }}>{clock}</div>
          <div style={{ fontSize: 11, color: C.muted, letterSpacing: "0.13em", textTransform: "uppercase", marginTop: 5 }}>{phase}</div>
        </div>
      </div>

      {/* schematic */}
      <div style={{ background: `linear-gradient(180deg, ${C.panel}, ${C.ground})`, border: `1px solid ${C.line}`, borderRadius: 12, overflow: "hidden" }}>
        <svg viewBox="0 0 1000 300" style={{ display: "block", width: "100%", height: "auto" }} role="img" aria-label="Water ATM daily operation schematic">
          <rect x="0" y="0" width="1000" height="40" fill={sky} />
          <circle cx={60 + (minute / 1440) * 880} cy="22" r="10" fill={dayish ? "#F2C879" : "#cdd9e0"} opacity={dayish ? 0.95 : 0.8} />
          <text x="20" y="26" fill="#9fb6bd" fontSize="12">{dayish ? "day" : "night"}</text>

          {/* 1 FEED */}
          <Box x={40} y={110} w={120} h={120} title="METRO FEED">
            <text x={100} y={185} textAnchor="middle" fill={C.ink} fontSize="15" fontWeight={600}>CMWSSB</text>
            <text x={100} y={205} textAnchor="middle" fill={C.good} fontSize="11">low TDS ✓</text>
          </Box>
          <Pipe d="M160,170 H220" />
          <path d="M160,170 H220" fill="none" stroke={C.cyan} strokeWidth={4} strokeLinecap="round" style={flowStyle(plantOn, dur(900))} />

          {/* 2 RO PLANT */}
          <Box x={220} y={110} w={130} h={120} title="RO PLANT">
            {[0, 1, 2].map(i => <rect key={i} x={250} y={150 + i * 18} width={70} height={10} rx={3} fill={plantOn ? C.cyan : C.pipe} opacity={plantOn ? 0.7 : 1} />)}
            <text x={285} y={216} textAnchor="middle" fill={C.ink} fontSize="13" fontWeight={600}>{plantOn ? `${fmtL(params.lph)} L/h` : "off"}</text>
          </Box>
          <Pipe d="M350,170 H430" />
          <path d="M350,170 H430" fill="none" stroke={C.cyan} strokeWidth={4} strokeLinecap="round" style={flowStyle(plantOn, dur(prod))} />

          {/* 3 TANK */}
          <text x={490} y={60} textAnchor="middle" fill={C.muted} fontSize="12">PRODUCT TANK · {fmtL(params.tankCap)} L</text>
          <rect x={430} y={70} width={120} height={180} rx={10} fill="#0a2026" stroke="#2c5a64" strokeWidth={2} />
          <clipPath id="dsimTank"><rect x={432} y={72} width={116} height={176} rx={9} /></clipPath>
          <g clipPath="url(#dsimTank)">
            <rect x={432} y={72 + (176 - 176 * tankFrac)} width={116} height={176 * tankFrac}
              fill={tank <= P.tankBadL ? C.alert : tank <= P.tankAmberL ? C.amber : C.cyan} opacity={0.85} />
          </g>
          <text x={490} y={270} textAnchor="middle" fill={C.ink} fontSize="16" fontWeight={600}>{fmtL(tank)} L</text>

          <Pipe d="M550,170 H680" />
          <path d="M550,170 H680" fill="none" stroke={C.cyan} strokeWidth={4} strokeLinecap="round" style={flowStyle(dem > 0, dur(dem))} />

          {/* 4 RFID ATM + cans */}
          <Box x={680} y={110} w={130} h={120} title="RFID ATM">
            <g>
              {Array.from({ length: 10 }).map((_, i) => {
                const filled = i < Math.round(cansFrac * 10);
                return <rect key={i} x={702 + (i % 5) * 18} y={150 + Math.floor(i / 5) * 24} width={12} height={18} rx={2}
                  fill={C.cyan} opacity={sim.cansL > 0 ? (filled ? 0.9 : 0.12) : 0.12} />;
              })}
            </g>
            <text x={745} y={216} textAnchor="middle" fill={cansCharging ? C.good : cansDraining ? C.amber : C.muted} fontSize="11">
              {sim.cansL > 0
                ? `${Math.round(cans / 10)} / ${params.cansCount} cans${cansCharging ? " ▲ filling" : cansDraining ? " ▼ draining" : ""}`
                : "no cans"}
            </text>
          </Box>
          <Pipe d="M810,170 H860" />
          <path d="M810,170 H860" fill="none" stroke={C.cyan} strokeWidth={4} strokeLinecap="round" style={flowStyle(dem > 0, dur(dem))} />

          {/* 5 HOUSEHOLDS */}
          <text x={925} y={104} textAnchor="middle" fill={C.muted} fontSize="12">HOUSEHOLDS</text>
          <g>
            {Array.from({ length: Math.max(1, Math.round(Math.min(1, dem / (sim.dailyDemand * 0.13 || 1)) * 12)) }).map((_, i) => (
              <circle key={i} cx={875 + (i % 4) * 22} cy={130 + Math.floor(i / 4) * 20} r={4.5}
                fill={unmetNow > 0 ? C.alert : C.cyan} opacity={0.85} />
            ))}
          </g>
          <text x={925} y={244} textAnchor="middle" fill={C.muted} fontSize="11">{fmtL(dem)} L/h</text>
        </svg>
      </div>

      {/* telemetry */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginTop: 14 }}>
        <Cell k="Production" v={fmtL(prod)} u="L/h" />
        <Cell k="Demand now" v={fmtL(dem)} u="L/h" />
        <Cell k="Tank level" v={fmtL(tank)} u="L" />
        {hasCans && (
          <Cell
            k={cansCharging ? "Can reserve ▲ filling" : cansDraining ? "Can reserve ▼ draining" : "Can reserve"}
            v={`${fmtL(cans)} / ${fmtL(sim.cansL)}`} u="L"
            alert={cans <= cansLowL}
            color={cansCharging ? C.good : cansDraining ? C.amber : undefined}
          />
        )}
        <Cell k="Dispensed today" v={fmtL(dispensed)} u="L" />
        <Cell k="Unmet today" v={fmtL(unmetTot)} u="L" alert={unmetTot > 0} />
      </div>

      <Verdict cls={vClass} title={vTitle} body={vBody} />

      {/* economics */}
      <div style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", marginTop: 16, marginBottom: 8 }}>
        Economics — at the current price &amp; cost settings
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
        <Cell k="Revenue / day" v={fmtINR(e.revDay)} />
        <Cell k="Op cost / day" v={fmtINR(e.opexDay)} />
        <Cell k="Surplus / day" v={(e.surplusDay >= 0 ? "+" : "−") + fmtINR(Math.abs(e.surplusDay))} color={e.surplusDay >= 0 ? C.good : C.alert} />
        <Cell k="Self-sufficiency" v={fmt1(e.oss) + "×"} />
        <Cell k="Break-even price" v={"₹" + (Math.round(e.ber * 100) / 100) + "/L"} />
        <Cell k="Surplus / month" v={(e.surplusMo >= 0 ? "" : "−") + fmtINR(Math.abs(e.surplusMo))} color={e.surplusMo >= 0 ? C.good : C.alert} />
      </div>
      <Verdict cls={ecClass} title={ecT} body={ecB} />

      {/* 24h graph */}
      <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 14px 8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: C.ink }}>Tank level &amp; can reserve across the day</span>
          <span style={{ fontSize: 11, color: C.muted }}>— tank · ⋯ cans · peaks shaded</span>
        </div>
        <svg viewBox="0 0 1000 170" preserveAspectRatio="none" style={{ height: 150, width: "100%" }} aria-label="Tank level over 24 hours">
          {P.peakBands.map(([a, b], i) => (
            <rect key={i} x={gx(a)} y={12} width={gx(b) - gx(a)} height={170 - 12 - 20} fill={C.amber} opacity={0.08} />
          ))}
          <line x1={8} x2={992} y1={graphY(P.tankWarnL, params.tankCap)} y2={graphY(P.tankWarnL, params.tankCap)} stroke={C.amber} strokeDasharray="4 5" strokeWidth={1} opacity={0.5} />
          <path d={graph.tankArea} fill={C.cyan} opacity={0.1} />
          <path d={graph.tankLine} fill="none" stroke={C.cyan} strokeWidth={2.5} />
          {sim.cansL > 0 && <path d={graph.cansLine} fill="none" stroke={C.amber} strokeWidth={1.8} strokeDasharray="5 4" opacity={0.85} />}
          {[0, 6, 12, 18, 24].map(hr => (
            <text key={hr} x={gx(hr)} y={164} fill={C.muted} fontSize={11} textAnchor={hr === 0 ? "start" : hr === 24 ? "end" : "middle"}>
              {String(hr).padStart(2, "0")}:00
            </text>
          ))}
          <line x1={markerX} x2={markerX} y1={12} y2={150} stroke={C.cyanBr} strokeWidth={1.5} />
          <circle cx={markerX} cy={markerY} r={4} fill={C.cyanBr} />
        </svg>
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
        <div style={{ flex: 1, minWidth: 180, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: C.muted }}>00:00</span>
          <input type="range" min={0} max={1440} step={1} value={minute}
            onChange={ev => { setPlaying(false); setMinute(Number(ev.target.value)); }}
            style={{ flex: 1, accentColor: C.cyan }} aria-label="Time of day" />
          <span style={{ fontSize: 12, color: C.muted }}>24:00</span>
        </div>
      </div>

      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, marginTop: 14, borderLeft: `2px solid ${C.line}`, paddingLeft: 13 }}>
        The plant makes a steady {fmtL(params.lph)} L/h during its {params.operatingHours >= 24 ? "round-the-clock" : `${Math.round(params.operatingHours)}-hour`} operating
        window {params.operatingHours >= 24 ? "" : "(from 6am) "}— banking into the tank — and pauses for the midday service window. Outside those hours,
        demand is served from the tank and the <b style={{ color: C.ink }}>cans (the reserve)</b>. Cut the operating hours
        and the evening draw leans harder on the buffer; push adoption, households or the peak up until the tank bottoms
        out, then add cans or hours, or spread the peak. Per-day economics use the finance model&apos;s monthly opex
        (÷ operating days); <b style={{ color: C.ink }}>break-even</b> is the ₹/L that just covers cost.
      </p>
    </div>
  );
}

// ── small presentational helpers ────────────────────────────────────────────
function dur(rate: number) { return rate <= 0 ? 0 : Math.max(0.35, 1.6 - (rate / 900) * 1.2); }

function Box({ x, y, w, h, title, children }: { x: number; y: number; w: number; h: number; title: string; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill="#0c2930" stroke={C.line} strokeWidth={2} />
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fill={C.muted} fontSize={12}>{title}</text>
      {children}
    </g>
  );
}
function Pipe({ d }: { d: string }) {
  return <path d={d} fill="none" stroke={C.pipe} strokeWidth={9} strokeLinecap="round" />;
}
function Cell({ k, v, u, color, alert }: { k: string; v: string; u?: string; color?: string; alert?: boolean }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 12px" }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.12em" }}>{k}</div>
      <div style={{ fontSize: 19, fontWeight: 600, marginTop: 6, fontVariantNumeric: "tabular-nums", color: alert ? C.alert : (color ?? C.ink) }}>
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

// ── graph geometry ──────────────────────────────────────────────────────────
const GW = 1000, GH = 170, PADX = 8, PADT = 12, PADB = 20;
function gx(hr: number) { return PADX + (hr / 24) * (GW - 2 * PADX); }
function graphY(v: number, tankCap: number) { return PADT + (1 - v / (tankCap || 1)) * (GH - PADT - PADB); }
function buildGraph(sim: ReturnType<typeof runDaySim>, tankCap: number) {
  const line = (levels: number[]) => {
    let d = `M${gx(0)},${graphY(levels[0], tankCap)}`;
    for (let hr = 1; hr <= 24; hr++) d += ` L${gx(hr)},${graphY(levels[hr], tankCap)}`;
    return d;
  };
  const tankLine = line(sim.tankLevels);
  return {
    tankLine,
    tankArea: `${tankLine} L${gx(24)},${GH - PADB} L${gx(0)},${GH - PADB} Z`,
    cansLine: line(sim.canLevels),
  };
}
function skyFor(m: number) {
  const x = m / 1440;
  if (x < 0.22) return "#0a1a2a";
  if (x < 0.34) return "#5a4a3a";
  if (x < 0.72) return "#1e4a5e";
  if (x < 0.84) return "#5a4a3a";
  return "#0a1a2a";
}
