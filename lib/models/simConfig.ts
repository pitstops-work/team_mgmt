// Default engine constants + presentation for the day-in-the-life sims.
//
// These values used to be hardcoded inside lib/models/daySim.ts,
// lib/models/complexSim.ts and the schematic renderers. They now live here as
// the single fallback source, while each model's daySim output `config` can
// override any of them (edited in the template editor's Sim tab). The engines
// and renderers merge `config.constants`/`config.presentation` over these, so
// an absent field always resolves to the prior behaviour — no model breaks.

import type {
  ComplexSimConstants,
  ComplexSimPresentation,
  RoSimConstants,
  RoSimPresentation,
} from "./types";

// ── RO water ─────────────────────────────────────────────────────────────────

export const DEFAULT_RO_CONSTANTS: RoSimConstants = {
  // Neutral 24-hour demand shape (sums ~1); reshaped by `peak` then renormalised.
  base: [
    0.005, 0.005, 0.005, 0.01, 0.03, 0.06, 0.11, 0.13, 0.10, 0.06, 0.05, 0.04,
    0.035, 0.03, 0.03, 0.035, 0.05, 0.07, 0.09, 0.07, 0.04, 0.02, 0.01, 0.005,
  ],
  serviceOff: [13, 14], // midday maintenance window — production pauses
  openHour: 6,          // operating window opens at 06:00
};

export const DEFAULT_RO_PRESENTATION: RoSimPresentation = {
  tankWarnL: 300,
  tankBadL: 60,
  tankAmberL: 250,
  cansEmptyL: 1,
  peakBands: [[6, 9], [17, 20]],
};

// ── Sanitation complex ───────────────────────────────────────────────────────

export const DEFAULT_COMPLEX_CONSTANTS: ComplexSimConstants = {
  revDaysPerMonth: 28, // matches the finance model's rev_*_monthly factor
  serviceOff: [13, 14],
  openHour: 6,
  flushL: 5, handwashL: 1.5, bathL: 25, loadL: 55,
  cleanBase: 150, cleanPerSeat: 8, cleanPerCubicle: 12, cleanPerMachine: 5,
  prof: {
    toilet: [0.005, 0.005, 0.005, 0.01, 0.025, 0.05, 0.09, 0.11, 0.08, 0.05, 0.04, 0.035, 0.03, 0.03, 0.03, 0.035, 0.05, 0.07, 0.085, 0.075, 0.05, 0.03, 0.015, 0.01],
    bath: [0.002, 0.002, 0.002, 0.005, 0.03, 0.08, 0.13, 0.14, 0.10, 0.05, 0.03, 0.02, 0.015, 0.015, 0.02, 0.03, 0.05, 0.07, 0.08, 0.06, 0.03, 0.015, 0.005, 0.002],
    laundry: [0.002, 0.002, 0.002, 0.002, 0.005, 0.01, 0.03, 0.05, 0.08, 0.11, 0.12, 0.11, 0.09, 0.08, 0.07, 0.06, 0.04, 0.03, 0.02, 0.015, 0.01, 0.005, 0.003, 0.002],
    ro: [0.005, 0.005, 0.005, 0.01, 0.03, 0.05, 0.09, 0.10, 0.08, 0.06, 0.05, 0.045, 0.04, 0.04, 0.04, 0.045, 0.05, 0.06, 0.075, 0.06, 0.04, 0.025, 0.015, 0.01],
  },
};

export const DEFAULT_COMPLEX_PRESENTATION: ComplexSimPresentation = {
  // Distinct hues per service — was toilet/bath both cyan, indistinguishable.
  services: [
    { key: "toilet", x: 150, y: 60, color: "#3DD6E0" },
    { key: "bath", x: 310, y: 60, color: "#F2A65A" },
    { key: "laundry", x: 470, y: 60, color: "#B8C46A" },
    { key: "ro", x: 150, y: 185, color: "#5FD3A6" },
  ],
  shortPctThreshold: 1.05,
};

// ── Merge helpers ────────────────────────────────────────────────────────────
// Shallow-merge an override over a default, skipping `undefined` keys so a
// partial config never clobbers a default with `undefined`. Nested objects
// (prof) are merged one level deep.

function defined<T extends object>(o?: Partial<T>): Partial<T> {
  if (!o) return {};
  const out: Partial<T> = {};
  for (const k of Object.keys(o) as (keyof T)[]) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

export function roConstants(c?: Partial<RoSimConstants>): RoSimConstants {
  return { ...DEFAULT_RO_CONSTANTS, ...defined(c) };
}

export function roPresentation(p?: Partial<RoSimPresentation>): RoSimPresentation {
  return { ...DEFAULT_RO_PRESENTATION, ...defined(p) };
}

export function complexConstants(c?: Partial<ComplexSimConstants>): ComplexSimConstants {
  const merged = { ...DEFAULT_COMPLEX_CONSTANTS, ...defined(c) };
  merged.prof = { ...DEFAULT_COMPLEX_CONSTANTS.prof, ...defined(c?.prof) };
  return merged;
}

export function complexPresentation(p?: Partial<ComplexSimPresentation>): ComplexSimPresentation {
  const merged = { ...DEFAULT_COMPLEX_PRESENTATION, ...defined(p) };
  // Merge service overrides by key onto the defaults so a partial list (e.g.
  // just a colour change for one service) keeps the others intact.
  if (p?.services?.length) {
    merged.services = DEFAULT_COMPLEX_PRESENTATION.services.map(d => {
      const o = p.services!.find(s => s.key === d.key);
      return o ? { ...d, ...defined(o) } : d;
    });
    // Append any extra services the override defines that aren't in defaults.
    for (const o of p.services) {
      if (!merged.services.some(s => s.key === o.key)) merged.services.push(o);
    }
  }
  return merged;
}
