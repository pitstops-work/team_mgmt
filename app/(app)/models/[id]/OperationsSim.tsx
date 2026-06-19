"use client";

import { useMemo } from "react";
import type { DaySimConfig, NodeValue } from "@/lib/models/types";
import DaySim from "./DaySim";
import ComplexDaySim from "./ComplexDaySim";

/** Resolves a daySim output's nodeKey map against the computed instance values
 *  and renders the matching schematic — so the sim reads the same inputs as the
 *  finance model (one source of truth). */
export default function OperationsSim({ config, values }: { config: DaySimConfig; values: Record<string, NodeValue> }) {
  const resolved = useMemo(() => {
    const num = (k?: string, fallback = 0) => {
      const v = k ? values[k] : undefined;
      return typeof v === "number" && Number.isFinite(v) ? v : fallback;
    };
    if (config.schematic === "sanitation_complex") {
      const n = config.nodes;
      return {
        kind: "complex" as const,
        params: {
          hh: num(n.hh), personsPerHH: num(n.personsPerHH, 5), adoption: num(n.adoption), peak: num(n.peak, 100),
          seats: num(n.seats), baths: num(n.baths), machines: num(n.machines), roLph: num(n.roLph), dewatsKld: num(n.dewatsKld),
          roTankCap: num(n.roTankCap, 4000), roCansCount: num(n.roCansCount),
          toiletUses: num(n.toiletUses), bathShare: num(n.bathShare), roLitresPerHH: num(n.roLitresPerHH),
          priceToilet: num(n.priceToilet), priceBath: num(n.priceBath), priceLaundry: num(n.priceLaundry), priceRo: num(n.priceRo),
          passPrice: num(n.passPrice), passShare: num(n.passShare), freeQuota: num(n.freeQuota),
          opexMonthly: num(n.opexMonthly),
          opexToilet: num(n.opexToilet), opexBath: num(n.opexBath), opexLaundry: num(n.opexLaundry),
          opexRo: num(n.opexRo), opexShared: num(n.opexShared),
          seatThroughput: num(n.seatThroughput, 12), bathThroughput: num(n.bathThroughput, 3),
          machineThroughput: num(n.machineThroughput, 1.3), roRecovery: num(n.roRecovery, 0.55),
        },
      };
    }
    const n = config.nodes;
    return {
      kind: "ro" as const,
      params: {
        lph: num(n.lph), tankCap: num(n.tankCap), cansCount: num(n.cansCount),
        hh: num(n.hh), adoption: num(n.adoption), lpd: num(n.lpd),
        peak: num(n.peak, 100), price: num(n.price), opexMonthly: num(n.opexMonthly),
        operatingDays: num(n.operatingDays, 30),
      },
    };
  }, [config, values]);

  return resolved.kind === "complex"
    ? <ComplexDaySim params={resolved.params} />
    : <DaySim params={resolved.params} />;
}
