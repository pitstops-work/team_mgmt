// Funnel target math — the two-stage model. Targets are always DERIVED from the
// blue-cell assumptions (SeedingFunnelConfig); we store only per-geo actuals.

export type FunnelConfig = {
  fellowsPerGeo: number;
  selectionRatio: number;
  appBufferPct: number;
  leadToApp: number;
  coldReachToApp: number;
  reachToLead: number;
  shareFromWarm: number;
};

export type FunnelTargets = {
  totalFellows: number;
  appsFloor: number;      // 10,000
  appsBuffer: number;     // +20%
  leadsToCapture: number; // pre-launch warm-lead target
  peopleToReach: number;  // pre-launch reach target
  perGeo: { reachTarget: number; leadTarget: number; appFloor: number };
  geoCount: number;
};

export function computeTargets(cfg: FunnelConfig, geoCount: number): FunnelTargets {
  const totalFellows = cfg.fellowsPerGeo * geoCount;
  const appsFloor = totalFellows * cfg.selectionRatio;
  const appsBuffer = Math.round(appsFloor * (1 + cfg.appBufferPct));
  // warm apps needed / lead→app rate → leads; leads / reach→lead → reach
  const warmApps = appsFloor * cfg.shareFromWarm;
  const leadsToCapture = Math.round(warmApps / cfg.leadToApp);
  const peopleToReach = Math.round(leadsToCapture / cfg.reachToLead);
  const safeGeo = Math.max(1, geoCount);
  return {
    totalFellows,
    appsFloor,
    appsBuffer,
    leadsToCapture,
    peopleToReach,
    geoCount,
    perGeo: {
      reachTarget: Math.round(peopleToReach / safeGeo),
      leadTarget: Math.round(leadsToCapture / safeGeo),
      appFloor: Math.round(appsFloor / safeGeo),
    },
  };
}

export function pct(actual: number, target: number): number {
  if (target <= 0) return 0;
  return Math.round((actual / target) * 100);
}

/** On-track band for a % of target: red < 50, amber 50–89, green ≥ 90. */
export function trackBand(p: number): "behind" | "warn" | "ontrack" {
  if (p >= 90) return "ontrack";
  if (p >= 50) return "warn";
  return "behind";
}
