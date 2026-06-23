// Day-in-the-life operations sim for an RO water plant — pure engine (no React).
//
// Runs a 24-hour, hour-by-hour simulation of a single plant: production banks
// into the product tank overnight, the tank buffers the daytime draw, and the
// pre-packed cans are the reserve that fills from tank overflow off-peak and
// drains at the rush. Output feeds the schematic, telemetry, 24h graph and the
// per-day economics (revenue / opex / surplus / OSS / break-even ₹-per-litre).
//
// Ported from the standalone ATM-01 prototype. The hourly demand curve and the
// midday service window are engineering constants here; the only user lever on
// the curve is `peak` (peak concentration). Per-day opex comes from the finance
// model's monthly opex node (÷30) so the two views can never disagree.

import type { RoSimConstants } from "./types";
import { roConstants } from "./simConfig";

/** Resolved sim inputs (mapped from instance node values). */
export type DaySimParams = {
  lph: number;          // plant capacity, L/hour
  tankCap: number;      // product tank size, L
  cansCount: number;    // number of 10 L cans
  hh: number;           // households in service area
  adoption: number;     // steady-state adoption fraction (0..1)
  lpd: number;          // litres per adopting HH per day
  peak: number;         // peak concentration (60 flat … 200 sharp); 100 = neutral
  price: number;        // ₹ per litre (effective, after pass discount)
  opexMonthly: number;  // total steady-state monthly opex, ₹
  operatingDays: number; // operating days per month — opex spread over these, so
                         // per-operating-day economics reconcile with the finance KPIs
  operatingHours: number; // hours/day the plant runs (contiguous window from 06:00);
                          // outside it, demand is served from the tank + cans
};

export type DaySimEcon = {
  servedDay: number;
  revDay: number;
  opexDay: number;
  opexMonthly: number;
  surplusDay: number;
  oss: number;          // operational self-sufficiency = rev / opex
  ber: number;          // break-even ₹/L = opexDay / servedDay
  surplusMo: number;
};

export type DaySimResult = {
  tankLevels: number[];   // length 25 (start-of-hour 0..24)
  canLevels: number[];    // length 25
  demands: number[];      // length 24 (L for that hour)
  prods: number[];        // length 24 (L/h produced)
  unmets: number[];       // length 24 (L unmet)
  dispensedCum: number[]; // length 24 (cumulative served)
  unmetCum: number[];     // length 24 (cumulative unmet)
  dailyDemand: number;
  cansL: number;          // reserve capacity in litres
  econ: DaySimEcon;
};

export function runDaySim(p: DaySimParams, constantsIn?: Partial<RoSimConstants>): DaySimResult {
  const K = roConstants(constantsIn);
  const BASE = K.base;
  const SERVICE_OFF = new Set(K.serviceOff);
  const OPEN_HOUR = K.openHour;
  const LPH = Math.max(0, p.lph);
  // Hours the plant is staffed/running. ≥24 ⇒ round-the-clock (minus service).
  const opHours = p.operatingHours > 0 ? Math.min(24, p.operatingHours) : 24;
  const running = (h: number) => opHours >= 24 ? true : ((h - OPEN_HOUR + 24) % 24) < opHours;
  const TANK = Math.max(0, p.tankCap);
  const cansL = Math.max(0, p.cansCount) * 10;
  const activeHH = Math.max(0, p.hh) * Math.max(0, p.adoption);
  const dailyDemand = activeHH * Math.max(0, p.lpd);

  const gamma = Math.max(0.01, p.peak / 100);
  let shaped = BASE.map(v => Math.pow(v, gamma));
  const s = shaped.reduce((a, b) => a + b, 0) || 1;
  shaped = shaped.map(v => v / s);

  const tankLevels: number[] = [];
  const canLevels: number[] = [];
  const demands: number[] = [];
  const prods: number[] = [];
  const unmets: number[] = [];
  const dispensedCum: number[] = [];
  const unmetCum: number[] = [];

  let tank = TANK;
  let cans = cansL;
  let dCum = 0;
  let uCum = 0;
  tankLevels.push(tank);
  canLevels.push(cans);

  for (let h = 0; h < 24; h++) {
    const d = dailyDemand * shaped[h];
    const prod = (running(h) && !SERVICE_OFF.has(h)) ? LPH : 0;
    const net = prod - d;
    let tankEnd: number;
    let cansEnd: number;
    let unmet = 0;
    if (net >= 0) {
      tankEnd = Math.min(TANK, tank + net);
      const charge = Math.max(0, tank + net - TANK);
      cansEnd = Math.min(cansL, cans + charge);
    } else {
      const deficit = -net;
      tankEnd = Math.max(0, tank - deficit);
      const draw = Math.max(0, deficit - tank);
      cansEnd = Math.max(0, cans - draw);
      unmet = Math.max(0, draw - cans);
    }
    const served = d - unmet;
    dCum += served;
    uCum += unmet;
    demands.push(d);
    prods.push(prod);
    unmets.push(unmet);
    dispensedCum.push(dCum);
    unmetCum.push(uCum);
    tank = tankEnd;
    cans = cansEnd;
    tankLevels.push(tank);
    canLevels.push(cans);
  }

  const servedDay = dCum;
  const opexMonthly = Math.max(0, p.opexMonthly);
  // Opex is spread over operating days (not calendar days), so one operating
  // day's P&L lines up with the finance model's per-litre and OSS figures.
  const days = p.operatingDays > 0 ? p.operatingDays : 30;
  const opexDay = opexMonthly / days;
  const revDay = servedDay * Math.max(0, p.price);
  const surplusDay = revDay - opexDay;
  const econ: DaySimEcon = {
    servedDay,
    revDay,
    opexDay,
    opexMonthly,
    surplusDay,
    oss: opexDay > 0 ? revDay / opexDay : 0,
    ber: servedDay > 0 ? opexDay / servedDay : 0,
    surplusMo: surplusDay * days,
  };

  return { tankLevels, canLevels, demands, prods, unmets, dispensedCum, unmetCum, dailyDemand, cansL, econ };
}

// ── Interpolation helpers (minute 0..1440) ──────────────────────────────────

/** Hourly value at minute m (step function — value held across the hour). */
export function hourlyAt(arr: number[], m: number): number {
  return arr[Math.min(23, Math.max(0, Math.floor(m / 60)))] ?? 0;
}

/** Linearly-interpolated start-of-hour level (tank/cans, length-25 arrays). */
export function levelAt(levels: number[], m: number): number {
  const x = m / 60;
  const h = Math.floor(x);
  const f = x - h;
  const a = levels[Math.min(h, 24)] ?? 0;
  const b = levels[Math.min(h + 1, 24)] ?? a;
  return a + (b - a) * f;
}
