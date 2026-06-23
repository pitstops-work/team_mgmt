"use client";

import { useMemo } from "react";
import type { DaySimConfig, NodeValue } from "@/lib/models/types";
import { resolveSimParams } from "@/lib/models/simResolve";
import DaySim from "./DaySim";
import ComplexDaySim from "./ComplexDaySim";

/** Resolves a daySim output's nodeKey map against the computed instance values
 *  and renders the matching schematic — so the sim reads the same inputs as the
 *  finance model (one source of truth). Engine constants + presentation come
 *  from the same config (config.constants / config.presentation), editable in
 *  the template editor's Sim tab. */
export default function OperationsSim({ config, values }: { config: DaySimConfig; values: Record<string, NodeValue> }) {
  const resolved = useMemo(() => resolveSimParams(config, values), [config, values]);

  if (config.schematic === "sanitation_complex" && resolved.kind === "complex") {
    return <ComplexDaySim params={resolved.params} constants={config.constants} presentation={config.presentation} />;
  }
  if (config.schematic === "ro_water" && resolved.kind === "ro") {
    return <DaySim params={resolved.params} constants={config.constants} presentation={config.presentation} />;
  }
  return null;
}
