// Resolve a daySim output's nodeKey map against computed instance values into
// the engine's param objects. Shared by the live Operations tab (OperationsSim)
// and the template editor's Sim-tab preview, so both read inputs identically.

import type { ComplexSimParams } from "./complexSim";
import type { DaySimParams } from "./daySim";
import type { DaySimConfig, NodeValue } from "./types";

export type ResolvedSim =
  | { kind: "complex"; params: ComplexSimParams }
  | { kind: "ro"; params: DaySimParams };

export function resolveSimParams(config: DaySimConfig, values: Record<string, NodeValue>): ResolvedSim {
  const num = (k?: string, fallback = 0) => {
    const v = k ? values[k] : undefined;
    return typeof v === "number" && Number.isFinite(v) ? v : fallback;
  };
  if (config.schematic === "sanitation_complex") {
    const n = config.nodes;
    return {
      kind: "complex",
      params: {
        hh: num(n.hh), personsPerHH: num(n.personsPerHH, 5), adoption: num(n.adoption), peak: num(n.peak, 100),
        seats: num(n.seats), baths: num(n.baths), machines: num(n.machines), roLph: num(n.roLph), dewatsKld: num(n.dewatsKld),
        roTankCap: num(n.roTankCap, 4000), roCansCount: num(n.roCansCount),
        toiletUses: num(n.toiletUses), bathShare: num(n.bathShare), roLitresPerHH: num(n.roLitresPerHH),
        laundryLoadsPerHHPerWeek: num(n.laundryLoadsPerHHPerWeek, 2),
        priceToilet: num(n.priceToilet), priceBath: num(n.priceBath), priceLaundry: num(n.priceLaundry), priceRo: num(n.priceRo),
        passPrice: num(n.passPrice), passShare: num(n.passShare), freeQuota: num(n.freeQuota),
        opexMonthly: num(n.opexMonthly),
        opexToilet: num(n.opexToilet), opexBath: num(n.opexBath), opexLaundry: num(n.opexLaundry),
        opexRo: num(n.opexRo), opexShared: num(n.opexShared),
        seatThroughput: num(n.seatThroughput, 12), bathThroughput: num(n.bathThroughput, 3),
        machineThroughput: num(n.machineThroughput, 1.3), roRecovery: num(n.roRecovery, 0.55),
        roOperatingHours: num(n.roOperatingHours, 24), facilityOpenHours: num(n.facilityOpenHours, 24),
        replacementReserveAnnual: num(n.replacementReserveAnnual, 0),
      },
    };
  }
  const n = config.nodes;
  return {
    kind: "ro",
    params: {
      lph: num(n.lph), tankCap: num(n.tankCap), cansCount: num(n.cansCount),
      hh: num(n.hh), adoption: num(n.adoption), lpd: num(n.lpd),
      peak: num(n.peak, 100), price: num(n.price), opexMonthly: num(n.opexMonthly),
      operatingDays: num(n.operatingDays, 30), operatingHours: num(n.operatingHours, 24),
    },
  };
}
