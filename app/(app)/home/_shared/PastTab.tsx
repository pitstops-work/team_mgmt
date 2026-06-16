"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { CalendarClock, CheckSquare, Target, MapPin, BarChart3, ChevronRight, ChevronLeft, LayoutDashboard, Users, TrendingUp, AlertTriangle, CheckCircle2, Clock, Filter, ChevronDown, ChevronUp, Mic, Square, Loader2, Paperclip } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import Avatar from "@/components/Avatar";
import type { ActivityGoal, Activity, ChecklistItem, Goal, TeamMember, ZLTeamActivity, TabKey } from "../_lib/types";
import { fmtTime, fmtDate, fmtDateShort, isToday, daysDiff, daysAgo, activityMeta, groupByDay, fmtDomain, groupBySla, slaHeaderLabel, engLevel, istTodayStr, shiftIstDate } from "../_lib/helpers";
import { STATUS_BADGE, STATUS_DOT, CHECKLIST_STATUS_DOT, EVENT_TYPE_COLOR, ACTIVITY_TYPE_STYLE, DESIGNATION_ORDER, DESIGNATION_COLOR, PITSTOP_STATUS_COLOR } from "../_lib/constants";
import type { DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat, RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone, OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity, AdminEngagementStat, AdminCityCoverage, LeaderTeamMember, RPClusterDeckCluster, FacilityLayerConfigLite } from "../page";
import { DoneActivityRow } from "../_shared/DoneActivityRow";
import { EmptyState, SectionTitle } from "../_shared/Primitives";

export function PastTab({
  userId, ownDoneActivities, teamDoneActivities, designation,
}: {
  userId: string;
  ownDoneActivities: Activity[];
  teamDoneActivities: ZLTeamActivity[];
  designation: string;
}) {
  const isMobileCarousel = true;
  const todayStart = new Date(new Date().toDateString()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 7 * dayMs;

  const [openSections, setOpenSections] = useState<Map<string, "open" | "closed">>(new Map());
  const DEFAULT_OPEN_PAST = new Set(["today"]);
  const isOpen = (cid: string, sec: string) => {
    const o = openSections.get(`${cid}:${sec}`);
    if (o) return o === "open";
    return DEFAULT_OPEN_PAST.has(sec);
  };
  const toggleSection = (cid: string, sec: string) => {
    const k = `${cid}:${sec}`;
    const current = isOpen(cid, sec);
    setOpenSections(prev => {
      const next = new Map(prev);
      next.set(k, current ? "closed" : "open");
      return next;
    });
  };
  // Mobile carousel
  const carouselRef = useRef<HTMLDivElement>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const handleCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el || el.clientWidth === 0) return;
    setCarouselIdx(Math.round(el.scrollLeft / el.clientWidth));
  };

  // ── Load older: extend the SSR-fetched lists by paging back from the oldest
  // currently-visible item. Tracked separately for own + team because the
  // server endpoint exposes both scopes and they're rendered independently.
  const PAGE_SIZE = 50;
  const [extraOwn, setExtraOwn] = useState<Activity[]>([]);
  const [extraTeam, setExtraTeam] = useState<ZLTeamActivity[]>([]);
  const [loadingOwn, setLoadingOwn] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [exhaustedOwn, setExhaustedOwn] = useState(false);
  const [exhaustedTeam, setExhaustedTeam] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const allOwn = useMemo(() => [...ownDoneActivities, ...extraOwn], [ownDoneActivities, extraOwn]);
  const allTeam = useMemo(() => [...teamDoneActivities, ...extraTeam], [teamDoneActivities, extraTeam]);

  const oldestIso = (list: { scheduledAt: string }[]) =>
    list.length === 0 ? null : list.reduce((min, a) => (a.scheduledAt < min ? a.scheduledAt : min), list[0].scheduledAt);

  async function loadOlder(scope: "own" | "team") {
    const before = oldestIso(scope === "own" ? allOwn : allTeam);
    if (!before) { (scope === "own" ? setExhaustedOwn : setExhaustedTeam)(true); return; }
    if (scope === "own") setLoadingOwn(true); else setLoadingTeam(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/home/past-activities?scope=${scope}&before=${encodeURIComponent(before)}&pageSize=${PAGE_SIZE}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { items: (Activity | ZLTeamActivity)[] } = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (scope === "own") {
        setExtraOwn(prev => [...prev, ...(items as Activity[])]);
        if (items.length < PAGE_SIZE) setExhaustedOwn(true);
      } else {
        setExtraTeam(prev => [...prev, ...(items as ZLTeamActivity[])]);
        if (items.length < PAGE_SIZE) setExhaustedTeam(true);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load older activity");
    } finally {
      if (scope === "own") setLoadingOwn(false); else setLoadingTeam(false);
    }
  }

  // Cluster bucketing for own done work.
  const UNCLUSTERED_ID = "__unclustered__";
  type Bucket = { id: string; name: string; today: Activity[]; week: Activity[]; earlier: Activity[]; earliestMs: number };
  const bucketMap = new Map<string, Bucket>();
  const ensureBucket = (c: { id: string; name: string } | null | undefined): Bucket => {
    const id = c?.id ?? UNCLUSTERED_ID;
    const name = c?.name ?? "No cluster";
    let b = bucketMap.get(id);
    if (!b) { b = { id, name, today: [], week: [], earlier: [], earliestMs: -Infinity }; bucketMap.set(id, b); }
    return b;
  };
  const clusterOf = (a: Activity) => a.pitstops?.[0]?.pitstop?.goal?.needsCluster ?? null;
  const ms = (a: Activity) => new Date(a.scheduledAt).getTime();
  for (const a of allOwn) {
    const b = ensureBucket(clusterOf(a));
    const t = ms(a);
    if (t >= todayStart) b.today.push(a);
    else if (t >= weekStart) b.week.push(a);
    else b.earlier.push(a);
  }
  // Sort within sections — most recent first.
  for (const b of bucketMap.values()) {
    b.today.sort((x, y) => ms(y) - ms(x));
    b.week.sort((x, y) => ms(y) - ms(x));
    b.earlier.sort((x, y) => ms(y) - ms(x));
    const latest = [b.today[0], b.week[0], b.earlier[0]].filter(Boolean).map(ms);
    b.earliestMs = latest.length > 0 ? Math.max(...latest) : -Infinity;
  }
  const buckets = [...bucketMap.values()].sort((a, b) => {
    if (a.id === UNCLUSTERED_ID) return 1;
    if (b.id === UNCLUSTERED_ID) return -1;
    return b.earliestMs - a.earliestMs; // most-recently-active cluster first
  });
  const nonEmptyBuckets = buckets.filter(b => b.today.length + b.week.length + b.earlier.length > 0);

  // Team breakdown — only when there's team data and the designation has reports.
  const hasTeam = (designation === "ZL" || designation === "PM" || (!["RP"].includes(designation) && allTeam.length > 0));
  const teamByOwner = new Map<string, ZLTeamActivity[]>();
  if (hasTeam) {
    for (const a of allTeam) {
      const owner = a.pitstops[0]?.pitstop?.ownerId;
      if (!owner) continue;
      if (!teamByOwner.has(owner)) teamByOwner.set(owner, []);
      teamByOwner.get(owner)!.push(a);
    }
    for (const arr of teamByOwner.values()) {
      arr.sort((x, y) => new Date(y.scheduledAt).getTime() - new Date(x.scheduledAt).getTime());
    }
  }
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
  const toggleMember = (id: string) => {
    setExpandedMembers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  // Per-owner display name + count rows. Resolve the owner's name from the
  // pitstop.owner relation directly — the previous attendee-lookup fallback
  // failed silently when the pitstop owner wasn't also tagged as attendee
  // (which is the norm for goal-co-owned work).
  const teamRows = [...teamByOwner.entries()]
    .map(([ownerId, items]) => {
      const memberName = items.find(it => it.pitstops[0]?.pitstop?.owner?.id === ownerId)?.pitstops[0]?.pitstop?.owner?.name
        ?? items.find(it => it.attendees.some(at => at.user.id === ownerId))?.attendees.find(at => at.user.id === ownerId)?.user.name
        ?? null;
      return { ownerId, name: memberName, count: items.length, items };
    })
    .sort((a, b) => b.count - a.count);

  const renderClusterCard = (bucket: Bucket) => (
    <section key={bucket.id} className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <header className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2 min-w-0">
        <MapPin className="w-4 h-4 text-stone-400 flex-shrink-0" />
        <h3 className="text-sm font-semibold text-stone-800 truncate">{bucket.name}</h3>
      </header>
      <div className="divide-y divide-stone-100">
        {([
          { key: "today", label: "Done today", items: bucket.today },
          { key: "week", label: "Done this week", items: bucket.week },
          { key: "earlier", label: "Done earlier", items: bucket.earlier },
        ] as const).map(section => {
          if (section.items.length === 0) return null;
          const open = isOpen(bucket.id, section.key);
          return (
            <div key={section.key}>
              <button
                onClick={() => toggleSection(bucket.id, section.key)}
                className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                <p className="text-[11px] font-semibold text-stone-600 uppercase tracking-wider flex-1">{section.label}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{section.items.length}</span>
                {open ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2">
                  {section.items.map(a => (
                    <DoneActivityRow key={a.id} a={a} userId={userId} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-8">
      {/* Own work */}
      {nonEmptyBuckets.length === 0 && (
        <EmptyState message="Nothing completed in the last 30 days." />
      )}

      {nonEmptyBuckets.length > 0 && isMobileCarousel && (
        <>
          <div className="sm:hidden">
            {nonEmptyBuckets.length > 1 && (
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs text-stone-400 tabular-nums">
                  {Math.min(carouselIdx + 1, nonEmptyBuckets.length)} of {nonEmptyBuckets.length}
                </span>
                <span className="text-[11px] text-stone-400 truncate ml-2">← swipe between clusters →</span>
              </div>
            )}
            <div
              ref={carouselRef}
              onScroll={handleCarouselScroll}
              className="flex overflow-x-auto snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none" }}
            >
              {nonEmptyBuckets.map(bucket => (
                <div key={bucket.id} className="snap-start flex-shrink-0 w-full pr-[1px]">
                  {renderClusterCard(bucket)}
                </div>
              ))}
            </div>
            {nonEmptyBuckets.length > 1 && (
              <div className="flex justify-center gap-1.5 mt-3">
                {nonEmptyBuckets.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === carouselIdx ? "w-4 bg-stone-700" : "w-1.5 bg-stone-200"
                  }`} />
                ))}
              </div>
            )}
          </div>
          <div className="hidden sm:grid sm:grid-cols-1 lg:grid-cols-2 gap-4">
            {nonEmptyBuckets.map(bucket => renderClusterCard(bucket))}
          </div>
        </>
      )}

      {nonEmptyBuckets.length > 0 && (
        <div className="flex justify-center">
          {exhaustedOwn ? (
            <span className="text-[11px] text-stone-400 italic">No older activity</span>
          ) : (
            <button
              onClick={() => loadOlder("own")}
              disabled={loadingOwn}
              className="text-xs font-medium px-3 py-1.5 rounded-full border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
            >
              {loadingOwn ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
              {loadingOwn ? "Loading…" : "Load older"}
            </button>
          )}
        </div>
      )}

      {/* Team breakdown */}
      {hasTeam && teamRows.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider">Team</h2>
          <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden divide-y divide-stone-100">
            {teamRows.map(row => {
              const expanded = expandedMembers.has(row.ownerId);
              return (
                <div key={row.ownerId}>
                  <button
                    onClick={() => toggleMember(row.ownerId)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-800 truncate">{row.name ?? "Unknown"}</p>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">{row.count} done</span>
                    {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
                  </button>
                  {expanded && (
                    <div className="px-3 pb-3 pt-2 space-y-2 bg-stone-50">
                      {row.items.slice(0, 50).map(a => (
                        <DoneActivityRow key={a.id} a={a as unknown as Activity} userId={userId} />
                      ))}
                      {row.items.length > 50 && (
                        <p className="text-[11px] text-stone-400 italic px-2 py-1">+{row.items.length - 50} more</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-center">
            {exhaustedTeam ? (
              <span className="text-[11px] text-stone-400 italic">No older team activity</span>
            ) : (
              <button
                onClick={() => loadOlder("team")}
                disabled={loadingTeam}
                className="text-xs font-medium px-3 py-1.5 rounded-full border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-wait flex items-center gap-1.5"
              >
                {loadingTeam ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className="w-3 h-3" />}
                {loadingTeam ? "Loading…" : "Load older"}
              </button>
            )}
          </div>
        </div>
      )}

      {loadError && (
        <p className="text-[11px] text-rose-500 text-center">{loadError}</p>
      )}
    </div>
  );
}

// Read-only row for completed activities on the Past tab.
