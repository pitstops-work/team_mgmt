"use client";

import dynamic from "next/dynamic";
import type { SettlementStop } from "./page";

const RoutePlannerView = dynamic(() => import("./RoutePlannerView"), { ssr: false });

export default function RoutePlannerLoader({ stops }: { stops: SettlementStop[] }) {
  return <RoutePlannerView stops={stops} />;
}
