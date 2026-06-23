// Day-in-the-life sim for a multi-service Community Sanitation Complex — pure
// engine (no React). Four services run in parallel:
//   · toilets / bathing / laundry — capacity-limited per hour (units × throughput)
//   · RO water — the same two-buffer (tank + cans) model as the standalone plant
// Greywater from bathing/laundry/handwash + the RO reject is treated by DEWATS
// (up to its KLD limit) and returned as recycled flush + cleaning water, cutting
// fresh demand. Per-day economics use the finance model's monthly opex (÷30).
//
// Ported from the Community Sanitation Complex prototype. Engineering water-use
// rates and the hourly demand curves are constants; user levers are capacities,
// usage, prices, adoption, the peak-concentration knob, and (advanced) throughput.

export type ComplexSimParams = {
  hh: number; personsPerHH: number; adoption: number; peak: number;
  seats: number; baths: number; machines: number; roLph: number; dewatsKld: number;
  roTankCap: number; roCansCount: number;
  toiletUses: number; bathShare: number; roLitresPerHH: number;
  laundryLoadsPerHHPerWeek: number; // laundry demand parameter (2 loads/HH/wk default)
  priceToilet: number; priceBath: number; priceLaundry: number; priceRo: number;
  passPrice: number; passShare: number; freeQuota: number;
  opexMonthly: number;
  // Per-service direct monthly opex + the shared/overhead residual (from the
  // finance model). Used to give each service a cost-to-serve and margin.
  opexToilet: number; opexBath: number; opexLaundry: number; opexRo: number; opexShared: number;
  seatThroughput: number; bathThroughput: number; machineThroughput: number; roRecovery: number;
  roOperatingHours: number;     // hours/day the RO plant runs (contiguous window from 06:00)
  facilityOpenHours: number;    // hours/day the complex is open (from 06:00); attended
                                // services (toilet/bath/laundry) only serve while open —
                                // closed-hour demand compresses into the open window
};

export type ComplexService = {
  key: "toilet" | "bath" | "laundry" | "ro";
  name: string;
  unit: string;
  served: number[];     // length 24 (served that hour)
  demand: number[];     // length 24 (demand that hour, before capacity clipping)
  servedDay: number;
  demandDay: number;
  capPerHour: number;
  peakUtil: number;     // max hourly served / capacity (>1 ⇒ queued at peak)
  revDay: number;       // per-use revenue (pass income is a separate stream)
  opDay: number;        // cost to serve = direct + share of overhead, ÷30
  marginDay: number;    // revDay − opDay
};

export type ComplexSimResult = {
  services: ComplexService[];
  activeHH: number;
  water: { freshDay: number; greywaterDay: number; dewatsUtil: number; recycledDay: number; netFreshPerUser: number; dewatsCap: number };
  econ: { revDay: number; opexDay: number; opexMonthly: number; surplusDay: number; oss: number; surplusMo: number; passRevDay: number };
};

// Engineering water-use per event (litres). Laundry demand is now a parameter
// (`laundryLoadsPerHHPerWeek`) — was a hardcoded 2 loads/HH/wk pre-rewrite.
const FLUSH_L = 5, HANDWASH_L = 1.5, BATH_L = 25, LOAD_L = 55, CLEANING_L = 500;
const SERVICE_OFF = new Set([13, 14]); // RO midday service window
const OPEN_HOUR = 6;                    // RO plant operating window opens at 06:00

const PROF = {
  toilet: [0.005, 0.005, 0.005, 0.01, 0.025, 0.05, 0.09, 0.11, 0.08, 0.05, 0.04, 0.035, 0.03, 0.03, 0.03, 0.035, 0.05, 0.07, 0.085, 0.075, 0.05, 0.03, 0.015, 0.01],
  bath: [0.002, 0.002, 0.002, 0.005, 0.03, 0.08, 0.13, 0.14, 0.10, 0.05, 0.03, 0.02, 0.015, 0.015, 0.02, 0.03, 0.05, 0.07, 0.08, 0.06, 0.03, 0.015, 0.005, 0.002],
  laundry: [0.002, 0.002, 0.002, 0.002, 0.005, 0.01, 0.03, 0.05, 0.08, 0.11, 0.12, 0.11, 0.09, 0.08, 0.07, 0.06, 0.04, 0.03, 0.02, 0.015, 0.01, 0.005, 0.003, 0.002],
  ro: [0.005, 0.005, 0.005, 0.01, 0.03, 0.05, 0.09, 0.10, 0.08, 0.06, 0.05, 0.045, 0.04, 0.04, 0.04, 0.045, 0.05, 0.06, 0.075, 0.06, 0.04, 0.025, 0.015, 0.01],
};

function shape(prof: number[], gamma: number): number[] {
  const s = prof.map(v => Math.pow(v, gamma));
  const t = s.reduce((a, b) => a + b, 0) || 1;
  return s.map(v => v / t);
}

/** Restrict a (normalised) demand profile to the facility's open window from
 *  06:00, renormalising so the daily total is preserved — i.e. closed-hour
 *  demand shifts into the open hours, concentrating the peak. */
function openWindow(prof: number[], openHours: number): number[] {
  const hours = openHours > 0 ? Math.min(24, openHours) : 24;
  if (hours >= 24) return prof;
  const masked = prof.map((v, h) => (((h - OPEN_HOUR + 24) % 24) < hours ? v : 0));
  const s = masked.reduce((a, b) => a + b, 0) || 1;
  return masked.map(v => v / s);
}

/** Capacity-limited service: each hour serves min(demand, hourlyCap). */
function simServed(dailyDemand: number, prof: number[], hourlyCap: number) {
  const served: number[] = [];
  const demand: number[] = [];
  let servedDay = 0;
  for (let h = 0; h < 24; h++) {
    const d = dailyDemand * prof[h];
    const s = Math.min(d, hourlyCap);
    served.push(s);
    demand.push(d);
    servedDay += s;
  }
  return { served, demand, servedDay };
}

/** RO two-buffer: tank banks production, cans absorb overflow / cover deficit.
 *  The plant produces only during its operating window (from 06:00). */
function simRO(dailyDemand: number, prof: number[], lph: number, tankCap: number, cansCap: number, opHours: number) {
  const served: number[] = [];
  const demand: number[] = [];
  let tank = tankCap, cans = cansCap, servedDay = 0;
  const hours = opHours > 0 ? Math.min(24, opHours) : 24;
  const running = (h: number) => hours >= 24 ? true : ((h - OPEN_HOUR + 24) % 24) < hours;
  for (let h = 0; h < 24; h++) {
    const d = dailyDemand * prof[h];
    const p = (running(h) && !SERVICE_OFF.has(h)) ? lph : 0;
    let s: number;
    if (p >= d) {
      const surplus = p - d;
      const charge = Math.max(0, tank + surplus - tankCap);
      tank = Math.min(tankCap, tank + surplus);
      cans = Math.min(cansCap, cans + charge);
      s = d;
    } else {
      const need = d - p;
      const fromTank = Math.min(tank, need);
      let rem = need - fromTank;
      const fromCans = Math.min(cans, rem);
      rem -= fromCans;
      tank -= fromTank;
      cans -= fromCans;
      s = d - rem;
    }
    served.push(s);
    demand.push(d);
    servedDay += s;
  }
  return { served, demand, servedDay };
}

export function runComplexSim(p: ComplexSimParams): ComplexSimResult {
  const gamma = Math.max(0.01, p.peak / 100);
  const activeHH = Math.max(0, p.hh) * Math.max(0, p.adoption);
  const persons = activeHH * Math.max(0, p.personsPerHH);

  const demUses = persons * Math.max(0, p.toiletUses);
  const demBaths = persons * Math.max(0, p.bathShare);
  const demLoads = activeHH * Math.max(0, p.laundryLoadsPerHHPerWeek) / 7;
  const demRO = activeHH * Math.max(0, p.roLitresPerHH);

  const capT = Math.max(0, p.seats) * Math.max(0, p.seatThroughput);
  const capB = Math.max(0, p.baths) * Math.max(0, p.bathThroughput);
  const capL = Math.max(0, p.machines) * Math.max(0, p.machineThroughput);

  // Attended services only serve while the complex is open; their demand
  // concentrates into the open window. RO dispensing is ATM-style (24h off the
  // tank), so it keeps the full-day profile.
  const T = simServed(demUses, openWindow(shape(PROF.toilet, gamma), p.facilityOpenHours), capT);
  const B = simServed(demBaths, openWindow(shape(PROF.bath, gamma), p.facilityOpenHours), capB);
  const L = simServed(demLoads, openWindow(shape(PROF.laundry, gamma), p.facilityOpenHours), capL);
  const R = simRO(demRO, shape(PROF.ro, gamma), p.roLph, p.roTankCap, Math.max(0, p.roCansCount) * 10, p.roOperatingHours);

  const uses = T.servedDay, baths = B.servedDay, loads = L.servedDay, product = R.servedDay;
  const recovery = Math.min(0.95, Math.max(0.05, p.roRecovery));

  // Water balance (on served).
  const feed = product / recovery;
  const reject = feed - product;
  const greywater = baths * BATH_L + loads * LOAD_L + uses * HANDWASH_L + reject;
  const dewatsCap = Math.max(0, p.dewatsKld) * 1000;
  const treated = Math.min(greywater, dewatsCap);
  const recycleDemand = uses * FLUSH_L + CLEANING_L;
  const recycledUsed = Math.min(treated, recycleDemand);
  const freshDay = baths * BATH_L + loads * LOAD_L + uses * HANDWASH_L + feed + Math.max(0, recycleDemand - recycledUsed);
  const dewatsUtil = dewatsCap > 0 ? greywater / dewatsCap : 0;

  // Per-use revenue from non-pass-holders. Toilet/bath also lose the free-use
  // quota; RO is metered (everyone pays, including pass holders — the pass does
  // not cover RO).
  const payFac = (1 - Math.max(0, p.freeQuota)) * (1 - Math.max(0, p.passShare));
  const revT_use = uses * p.priceToilet * payFac;
  const revB_use = baths * p.priceBath * payFac;
  const revL_use = loads * p.priceLaundry * (1 - Math.max(0, p.passShare));
  const revR = product * p.priceRo;

  // Pass revenue allocation — the monthly pass covers toilet+bath+laundry use,
  // so its income belongs to those three streams, not as a separate bucket.
  // Allocate by served-value share (uses × posted price), which mirrors how a
  // pass-holder's foregone per-use fees would have weighed by service.
  const passRevDay = activeHH * Math.max(0, p.passShare) * Math.max(0, p.passPrice) / 30;
  const vT = uses * p.priceToilet, vB = baths * p.priceBath, vL = loads * p.priceLaundry;
  const vSum = vT + vB + vL;
  const wT = vSum > 0 ? vT / vSum : 1 / 3;
  const wB = vSum > 0 ? vB / vSum : 1 / 3;
  const wL = vSum > 0 ? vL / vSum : 1 / 3;
  const revT = revT_use + passRevDay * wT;
  const revB = revB_use + passRevDay * wB;
  const revL = revL_use + passRevDay * wL;

  // Total day revenue — pass already inside revT/revB/revL, do not add again.
  const revDay = revT + revB + revL + revR;

  const opexMonthly = Math.max(0, p.opexMonthly);
  const opexDay = opexMonthly / 30;
  const surplusDay = revDay - opexDay;

  // Per-service cost-to-serve: each service's direct opex plus a share of the
  // shared/overhead pool (allocated by direct-opex weight, so it's stable and
  // doesn't move with price). Sums back to total opexDay since shared is the
  // finance model's residual = opexMonthly − Σ direct.
  const direct = { toilet: Math.max(0, p.opexToilet), bath: Math.max(0, p.opexBath), laundry: Math.max(0, p.opexLaundry), ro: Math.max(0, p.opexRo) };
  const sumDirect = direct.toilet + direct.bath + direct.laundry + direct.ro;
  const loadFactor = sumDirect > 0 ? (sumDirect + Math.max(0, p.opexShared)) / sumDirect : 1;
  const opDayOf = (d: number) => (sumDirect > 0 ? (d * loadFactor) / 30 : opexDay / 4);

  const mk = (key: ComplexService["key"], name: string, unit: string, sv: { served: number[]; demand: number[]; servedDay: number }, demandDay: number, cap: number, rev: number, dir: number): ComplexService => {
    const opDay = opDayOf(dir);
    return { key, name, unit, served: sv.served, demand: sv.demand, servedDay: sv.servedDay, demandDay, capPerHour: cap, peakUtil: cap > 0 ? Math.max(...sv.served) / cap : 0, revDay: rev, opDay, marginDay: rev - opDay };
  };
  const services: ComplexService[] = [
    mk("toilet", "Toilets", "uses", T, demUses, capT, revT, direct.toilet),
    mk("bath", "Bathing", "baths", B, demBaths, capB, revB, direct.bath),
    mk("laundry", "Laundry", "loads", L, demLoads, capL, revL, direct.laundry),
    mk("ro", "RO Water", "L", R, demRO, p.roLph, revR, direct.ro),
  ];

  return {
    services,
    activeHH,
    water: { freshDay, greywaterDay: greywater, dewatsUtil, recycledDay: recycledUsed, netFreshPerUser: persons > 0 ? freshDay / persons : 0, dewatsCap },
    econ: { revDay, opexDay, opexMonthly, surplusDay, oss: opexDay > 0 ? revDay / opexDay : 0, surplusMo: surplusDay * 30, passRevDay },
  };
}
