"use client";

import Link from "next/link";
import { CalendarRange, ListFilter, AlertTriangle } from "lucide-react";
import type { SlaMix } from "./lib";

// Stacked SLA bar — the dominant visual on every tile.
export function SlaBar({ mix, height = 10 }: { mix: SlaMix; height?: number }) {
  if (mix.total === 0) {
    return (
      <div
        className="w-full rounded-full bg-stone-100 border border-stone-100"
        style={{ height }}
      />
    );
  }
  const pct = (n: number) => (n / mix.total) * 100;
  return (
    <div
      className="w-full rounded-full overflow-hidden flex bg-stone-100 border border-stone-100"
      style={{ height }}
    >
      {mix.red > 0   && <div className="bg-red-400 h-full"     style={{ width: `${pct(mix.red)}%`   }} />}
      {mix.amber > 0 && <div className="bg-amber-400 h-full"   style={{ width: `${pct(mix.amber)}%` }} />}
      {mix.green > 0 && <div className="bg-emerald-400 h-full" style={{ width: `${pct(mix.green)}%` }} />}
    </div>
  );
}

function CountLine({ pitstopMix, goalCount }: { pitstopMix: SlaMix; goalCount: number }) {
  return (
    <div className="flex items-center gap-3 text-[10px] text-stone-500 tabular-nums">
      <span>{goalCount} goal{goalCount === 1 ? "" : "s"}</span>
      <span className="text-stone-300">·</span>
      <span>{pitstopMix.total} pitstop{pitstopMix.total === 1 ? "" : "s"}</span>
      {pitstopMix.red > 0 && (
        <span className="ml-auto flex items-center gap-0.5 text-red-500 font-semibold">
          <AlertTriangle className="w-2.5 h-2.5" />{pitstopMix.red}
        </span>
      )}
    </div>
  );
}

// L1: big quarter tile (4 across the grid). Click → L2.
export function QuarterTile({
  title, subtitle, mix, goalCount, isCurrent, isPast, href,
}: {
  title: string;
  subtitle: string;
  mix: SlaMix;
  goalCount: number;
  isCurrent?: boolean;
  isPast?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-xl border p-4 transition-all hover:shadow-sm hover:-translate-y-0.5 ${
        isCurrent
          ? "border-sky-300 bg-sky-50/50"
          : isPast
          ? "border-stone-100 bg-stone-50/40"
          : "border-stone-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CalendarRange className={`w-3.5 h-3.5 flex-shrink-0 ${isCurrent ? "text-sky-500" : "text-stone-400"}`} />
            <span className={`text-sm font-semibold truncate ${isCurrent ? "text-sky-800" : "text-stone-800"}`}>{title}</span>
          </div>
          <p className={`text-[10px] mt-0.5 ${isPast ? "text-stone-300" : "text-stone-400"}`}>{subtitle}</p>
        </div>
        {isCurrent && (
          <span className="text-[9px] font-semibold bg-sky-500 text-white px-1.5 py-0.5 rounded-full flex-shrink-0">Current</span>
        )}
      </div>

      <div className="mt-3 mb-2">
        <SlaBar mix={mix} height={10} />
      </div>
      <CountLine pitstopMix={mix} goalCount={goalCount} />
    </Link>
  );
}

// L2: month tile. Compact variant of QuarterTile.
export function MonthTile({
  title, subtitle, mix, goalCount, isCurrent, isPast, href,
}: {
  title: string;
  subtitle: string;
  mix: SlaMix;
  goalCount: number;
  isCurrent?: boolean;
  isPast?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-xl border p-3.5 transition-all hover:shadow-sm hover:-translate-y-0.5 ${
        isCurrent
          ? "border-sky-300 bg-sky-50/50"
          : isPast
          ? "border-stone-100 bg-stone-50/40"
          : "border-stone-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-xs font-semibold ${isCurrent ? "text-sky-800" : "text-stone-700"}`}>{title}</span>
        {isCurrent && (
          <span className="text-[8px] font-semibold bg-sky-500 text-white px-1 py-0.5 rounded-full">Now</span>
        )}
      </div>
      <p className="text-[10px] text-stone-400 mb-2">{subtitle}</p>
      <div className="mb-2">
        <SlaBar mix={mix} height={8} />
      </div>
      <CountLine pitstopMix={mix} goalCount={goalCount} />
    </Link>
  );
}

// L2: "Overall Quarter" tile — visually distinct (heavier border + Review affordance).
export function OverallQuarterTile({
  title, subtitle, mix, goalCount, href,
}: {
  title: string;
  subtitle: string;
  mix: SlaMix;
  goalCount: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border-2 border-stone-800 bg-stone-900 text-white p-3.5 transition-all hover:shadow-md hover:-translate-y-0.5 flex flex-col"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold">{title}</span>
        <span className="flex items-center gap-1 text-[9px] font-semibold bg-white/15 px-1.5 py-0.5 rounded-full">
          <ListFilter className="w-2.5 h-2.5" /> Review
        </span>
      </div>
      <p className="text-[10px] text-stone-400 mb-2">{subtitle}</p>
      <div className="mb-2">
        <SlaBar mix={mix} height={10} />
      </div>
      <div className="flex items-center gap-3 text-[10px] text-stone-300 tabular-nums">
        <span>{goalCount} goal{goalCount === 1 ? "" : "s"}</span>
        <span className="text-stone-500">·</span>
        <span>{mix.total} pitstop{mix.total === 1 ? "" : "s"}</span>
        {mix.red > 0 && (
          <span className="ml-auto flex items-center gap-0.5 text-red-300 font-semibold">
            <AlertTriangle className="w-2.5 h-2.5" />{mix.red}
          </span>
        )}
      </div>
    </Link>
  );
}
