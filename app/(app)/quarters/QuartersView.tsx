"use client";

import { useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import type { GoalData } from "./lib";
import {
  fyQuarter, quarterBounds, quarterMonths, qKey, Q_LABELS,
  goalsInRange, goalsTargetingRange, slaMix,
  fmtDayMonth, fmtDayMonthYear, fmtMonthYearLong,
} from "./lib";
import { QuarterTile, MonthTile, OverallQuarterTile } from "./tiles";
import GoalsThisQuarterStrip from "./GoalsThisQuarterStrip";
import QuarterListView from "./QuarterListView";
import { EMPTY_FILTERS, type FilterState, type GroupBy } from "./FilterBar";

// ── URL state helpers ──────────────────────────────────────────────────────

function parseQ(s: string | null): { fyYear: number; q: number } | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-([1-4])$/);
  if (!m) return null;
  return { fyYear: Number(m[1]), q: Number(m[2]) };
}

function parseCsv(s: string | null): string[] {
  if (!s) return [];
  return s.split(",").filter(Boolean);
}

function parseSla(s: string | null): ("red" | "amber" | "green")[] {
  return parseCsv(s).filter(x => x === "red" || x === "amber" || x === "green") as ("red"|"amber"|"green")[];
}

function parseGroupBy(s: string | null): GroupBy {
  const valid: GroupBy[] = ["none", "city", "zone", "cluster", "owner", "domain", "sla"];
  return (valid.includes(s as GroupBy) ? (s as GroupBy) : "none");
}

function buildHref(pathname: string, params: URLSearchParams, patch: Record<string, string | null>): string {
  const next = new URLSearchParams(params.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") next.delete(k);
    else next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function QuartersView({ goals }: { goals: GoalData[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const currentQ = useMemo(() => fyQuarter(today), [today]);

  // URL state
  const fyFromUrl = Number(searchParams.get("fy"));
  const fyYear = Number.isFinite(fyFromUrl) && fyFromUrl > 0 ? fyFromUrl : currentQ.fyYear;
  const qParam = parseQ(searchParams.get("q"));
  const mParam = (() => { const m = Number(searchParams.get("m")); return Number.isFinite(m) && m >= 0 && m <= 2 ? m : null; })();
  const overallParam = searchParams.get("overall") === "1";

  const filters: FilterState = useMemo(() => ({
    city:       parseCsv(searchParams.get("city")),
    zone:       parseCsv(searchParams.get("zone")),
    cluster:    parseCsv(searchParams.get("cluster")),
    settlement: parseCsv(searchParams.get("settlement")),
    domain:     parseCsv(searchParams.get("domain")),
    owner:      parseCsv(searchParams.get("owner")),
    sla:        parseSla(searchParams.get("sla")),
  }), [searchParams]);

  const groupBy = parseGroupBy(searchParams.get("group"));

  const setGroupBy = useCallback((g: GroupBy) => {
    router.replace(buildHref(pathname, searchParams, { group: g === "none" ? null : g }), { scroll: false });
  }, [router, pathname, searchParams]);

  const setFilters = useCallback((f: FilterState) => {
    router.replace(buildHref(pathname, searchParams, {
      city:       f.city.length       ? f.city.join(",")       : null,
      zone:       f.zone.length       ? f.zone.join(",")       : null,
      cluster:    f.cluster.length    ? f.cluster.join(",")    : null,
      settlement: f.settlement.length ? f.settlement.join(",") : null,
      domain:     f.domain.length     ? f.domain.join(",")     : null,
      owner:      f.owner.length      ? f.owner.join(",")      : null,
      sla:        f.sla.length        ? f.sla.join(",")        : null,
    }), { scroll: false });
  }, [router, pathname, searchParams]);

  // ── L3: list view (month or overall quarter) ─────────────────────────────
  if (qParam && (mParam !== null || overallParam)) {
    const { fyYear: y, q } = qParam;
    if (mParam !== null) {
      const months = quarterMonths(y, q);
      const m = months[mParam];
      const monthName = fmtMonthYearLong(m.start);
      return (
        <QuarterListView
          goals={goals}
          today={today}
          start={m.start}
          end={m.end}
          title={monthName}
          subtitle={`Month ${mParam + 1} of Q${q} FY${y}–${String(y + 1).slice(2)}`}
          backHref={buildHref(pathname, searchParams, { m: null, overall: null })}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
          filters={filters}
          onFiltersChange={setFilters}
        />
      );
    }
    const { start, end } = quarterBounds(y, q);
    return (
      <QuarterListView
        goals={goals}
        today={today}
        start={start}
        end={end}
        title={`Q${q} Review · FY${y}–${String(y + 1).slice(2)}`}
        subtitle={`${Q_LABELS[q - 1]} · ${fmtDayMonth(start)} – ${fmtDayMonthYear(end)}`}
        backHref={buildHref(pathname, searchParams, { m: null, overall: null })}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        filters={filters}
        onFiltersChange={setFilters}
      />
    );
  }

  // ── L2: quarter detail (3 month tiles + overall + secondary goal lane) ───
  if (qParam) {
    const { fyYear: y, q } = qParam;
    const { start, end } = quarterBounds(y, q);
    const months = quarterMonths(y, q);
    const isCurrentQ = y === currentQ.fyYear && q === currentQ.q;

    const quarterItems = goalsInRange(goals, start, end);
    const quarterMix = slaMix(quarterItems.flatMap(i => i.pitstops), today);
    const secondaryGoals = goalsTargetingRange(goals, start, end);

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <Link
          href={buildHref(pathname, searchParams, { q: null, m: null, overall: null })}
          className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> All quarters
        </Link>

        <div className="mt-2 mb-1 flex items-center gap-2">
          <CalendarRange className="w-5 h-5 text-stone-400" />
          <h1 className="text-lg font-semibold text-stone-900">
            Q{q} · FY{y}–{String(y + 1).slice(2)}
          </h1>
          {isCurrentQ && (
            <span className="text-[10px] font-semibold bg-sky-500 text-white px-1.5 py-0.5 rounded-full">Current</span>
          )}
        </div>
        <p className="text-xs text-stone-400 mb-6">
          {Q_LABELS[q - 1]} · {fmtDayMonth(start)} – {fmtDayMonthYear(end)}
        </p>

        {/* 3 month tiles + overall tile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {months.map((m, idx) => {
            const items = goalsInRange(goals, m.start, m.end);
            const mix = slaMix(items.flatMap(i => i.pitstops), today);
            const monthIsCurrent = today >= m.start && today <= m.end;
            const monthIsPast = m.end < today;
            const monthFull = fmtMonthYearLong(m.start);
            return (
              <MonthTile
                key={idx}
                title={monthFull}
                subtitle={`${fmtDayMonth(m.start)} – ${fmtDayMonth(m.end)}`}
                mix={mix}
                goalCount={items.length}
                isCurrent={monthIsCurrent}
                isPast={monthIsPast}
                href={buildHref(pathname, searchParams, { q: qKey(y, q), m: String(idx), overall: null })}
              />
            );
          })}
          <OverallQuarterTile
            title="Overall quarter"
            subtitle="Full Q review with filters"
            mix={quarterMix}
            goalCount={quarterItems.length}
            href={buildHref(pathname, searchParams, { q: qKey(y, q), overall: "1", m: null })}
          />
        </div>

        {/* Secondary lane: goals targeting this quarter */}
        <GoalsThisQuarterStrip goals={secondaryGoals} today={today} />
      </div>
    );
  }

  // ── L1: FY overview (4 quarter tiles + year nav) ─────────────────────────
  const tiles = [1, 2, 3, 4].map(q => {
    const { start, end } = quarterBounds(fyYear, q);
    const items = goalsInRange(goals, start, end);
    const mix = slaMix(items.flatMap(i => i.pitstops), today);
    const isCurrent = fyYear === currentQ.fyYear && q === currentQ.q;
    const isPast    = end < today;
    return { q, start, end, mix, goalCount: items.length, isCurrent, isPast };
  });

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="flex items-center gap-2 mb-1">
        <CalendarRange className="w-5 h-5 text-stone-400" />
        <h1 className="text-lg font-semibold text-stone-900">Quarterly Review</h1>
        <span className="text-xs text-stone-400 ml-1">· Indian FY (Apr–Mar)</span>
      </div>

      {/* Year nav */}
      <div className="flex items-center gap-3 mb-6 mt-3">
        <Link
          href={buildHref(pathname, searchParams, { fy: String(fyYear - 1) })}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-stone-500 border border-stone-200 rounded-md hover:border-stone-300 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" /> FY{fyYear - 1}–{String(fyYear).slice(2)}
        </Link>
        <span className="text-sm font-semibold text-stone-700">FY{fyYear}–{String(fyYear + 1).slice(2)}</span>
        <Link
          href={buildHref(pathname, searchParams, { fy: String(fyYear + 1) })}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-stone-500 border border-stone-200 rounded-md hover:border-stone-300 transition-colors"
        >
          FY{fyYear + 1}–{String(fyYear + 2).slice(2)} <ChevronRight className="w-3 h-3" />
        </Link>
        {fyYear !== currentQ.fyYear && (
          <Link
            href={buildHref(pathname, searchParams, { fy: null })}
            className="ml-auto text-[10px] text-stone-400 hover:text-stone-700 underline"
          >
            Back to current FY
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(t => (
          <QuarterTile
            key={t.q}
            title={`Q${t.q} · ${Q_LABELS[t.q - 1]}`}
            subtitle={`${fmtDayMonth(t.start)} – ${fmtDayMonthYear(t.end)}`}
            mix={t.mix}
            goalCount={t.goalCount}
            isCurrent={t.isCurrent}
            isPast={t.isPast}
            href={buildHref(pathname, searchParams, { q: qKey(fyYear, t.q), m: null, overall: null })}
          />
        ))}
      </div>

      {/* Empty-state hint */}
      {tiles.every(t => t.mix.total === 0) && (
        <div className="mt-6 text-center py-8 border border-dashed border-stone-200 rounded-xl">
          <CalendarRange className="w-7 h-7 text-stone-200 mx-auto mb-2" />
          <p className="text-sm text-stone-400">No pitstops scheduled in this FY.</p>
        </div>
      )}

      {/* Footer hint */}
      <p className="text-[10px] text-stone-300 mt-6 text-center">
        Click a quarter for monthly breakdown · overall-quarter tile is the manager-review entry.
      </p>
    </div>
  );
}
