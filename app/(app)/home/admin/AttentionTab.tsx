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
import { EmptyState, SectionTitle } from "../_shared/Primitives";

export function AdminAttentionTab({ dash }: { dash: AdminDash }) {
  const [section, setSection] = useState<"pitstops" | "activities">("pitstops");
  const [desigFilter, setDesigFilter] = useState("All");
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  function toggleId(id: string) {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  // Union of owners across both sections so the dropdown is stable when the
  // user toggles section. Dedupe by ownerId. Skip nulls (rows without an
  // identified owner stay reachable via the unfiltered list).
  const ownerOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; designation: string | null }>();
    for (const p of dash.delayedPitstopsAll) {
      if (p.ownerId && !m.has(p.ownerId)) m.set(p.ownerId, { id: p.ownerId, name: p.ownerName ?? "Unnamed", designation: p.ownerDesignation });
    }
    for (const a of dash.overdueActivitiesList) {
      if (a.ownerId && !m.has(a.ownerId)) m.set(a.ownerId, { id: a.ownerId, name: a.ownerName ?? "Unnamed", designation: a.ownerDesignation });
    }
    const desigRank = (d: string | null) => {
      const i = DESIGNATION_ORDER.indexOf(d ?? "");
      return i === -1 ? 999 : i;
    };
    return [...m.values()].sort((a, b) => {
      const r = desigRank(a.designation) - desigRank(b.designation);
      return r !== 0 ? r : a.name.localeCompare(b.name);
    });
  }, [dash.delayedPitstopsAll, dash.overdueActivitiesList]);

  // Designation filter AND people-filter both apply. Empty people-selection
  // means "any person" so it doesn't fight with the designation chip.
  const matchesPeople = (ownerId: string | null) =>
    selectedOwnerIds.size === 0 || (ownerId !== null && selectedOwnerIds.has(ownerId));
  const matchesDesig = (d: string | null) => desigFilter === "All" || d === desigFilter;

  const filteredPitstops: AdminDelayedPitstop[] = dash.delayedPitstopsAll
    .filter(p => matchesDesig(p.ownerDesignation) && matchesPeople(p.ownerId));
  const filteredActivities: AdminOverdueActivity[] = dash.overdueActivitiesList
    .filter(a => matchesDesig(a.ownerDesignation) && matchesPeople(a.ownerId));

  const sectionCount = section === "pitstops" ? filteredPitstops.length : filteredActivities.length;

  return (
    <div className="space-y-4">
      {/* Section toggle */}
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={() => setSection("pitstops")}
          className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${section === "pitstops" ? "bg-red-500 text-white border-red-500" : "border-stone-200 text-stone-600 hover:border-red-300"}`}>
          {dash.delayedPitstopsAll.length} Delayed Pitstops
        </button>
        <button type="button" onClick={() => setSection("activities")}
          className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${section === "activities" ? "bg-amber-500 text-white border-amber-500" : "border-stone-200 text-stone-600 hover:border-amber-300"}`}>
          {dash.overdueActivitiesList.length} Overdue Activities
        </button>
      </div>

      {/* Designation filter */}
      <div className="flex gap-2 flex-wrap items-center">
        {["All", "PM", "ZL", "RP"].map(d => (
          <button key={d} type="button" onClick={() => setDesigFilter(d)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${desigFilter === d ? "bg-sky-500 text-white border-sky-500" : "border-stone-200 text-stone-600 hover:border-sky-300"}`}>
            {d}
          </button>
        ))}
        <PeoplePicker
          options={ownerOptions}
          selected={selectedOwnerIds}
          onChange={setSelectedOwnerIds}
        />
        <span className="ml-auto text-xs text-stone-400 self-center">{sectionCount} item{sectionCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Delayed pitstops */}
      {section === "pitstops" && (
        <div className="space-y-2">
          {filteredPitstops.length === 0
            ? <EmptyState message="No delayed pitstops." />
            : filteredPitstops.map(p => {
                const isOpen = expandedIds.has(p.id);
                return (
                  <div key={p.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <Link href={`/goals/${p.goalId}`} className="text-sm font-medium text-stone-800 hover:text-sky-700 truncate block">{p.title}</Link>
                        <p className="text-xs text-stone-500 truncate">{p.goalTitle}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.ownerName && <span className="text-[10px] text-stone-500">{p.ownerName}</span>}
                          {p.ownerDesignation && (
                            <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${DESIGNATION_COLOR[p.ownerDesignation] ?? "bg-stone-100 text-stone-500"}`}>
                              {p.ownerDesignation}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {p.targetDate && (
                          <span className="text-xs font-bold text-red-700">{p.daysOverdue}d</span>
                        )}
                        {p.pendingChecklists.length > 0 && (
                          <button type="button" onClick={() => toggleId(p.id)}
                            className="text-[10px] font-medium text-violet-700 bg-violet-50 border border-violet-100 px-1.5 py-0.5 rounded hover:bg-violet-100 flex items-center gap-0.5">
                            {p.pendingChecklists.length} checklist
                            {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="border-t border-stone-100 bg-stone-50 px-4 py-2 space-y-1">
                        {p.pendingChecklists.map(ci => (
                          <p key={ci.id} className="text-xs text-stone-600 flex items-start gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-stone-400 mt-1.5 flex-shrink-0" />
                            {ci.text}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
          }
        </div>
      )}

      {/* Overdue activities */}
      {section === "activities" && (
        <div className="space-y-2">
          {filteredActivities.length === 0
            ? <EmptyState message="No overdue activities." />
            : filteredActivities.map(a => (
                <div key={a.id} className="bg-white border border-stone-200 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${EVENT_TYPE_COLOR[a.type] ?? "bg-stone-300"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-800 truncate">{a.title}</p>
                    {a.goalTitle && <p className="text-xs text-stone-500 truncate">{a.goalTitle}</p>}
                    <div className="flex items-center gap-2 mt-0.5">
                      {a.ownerName && <span className="text-[10px] text-stone-500">{a.ownerName}</span>}
                      {a.ownerDesignation && (
                        <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${DESIGNATION_COLOR[a.ownerDesignation] ?? "bg-stone-100 text-stone-500"}`}>
                          {a.ownerDesignation}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-amber-700 flex-shrink-0">{fmtDateShort(a.scheduledAt)}</span>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

// People multi-select for the Attention tab. Mirrors the EventsCalendar
// GoalPicker pattern (chip button + dropdown, dismiss on outside click) so
// the filter row reads the same as elsewhere in the app.
function PeoplePicker({
  options, selected, onChange,
}: {
  options: { id: string; name: string; designation: string | null }[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const label = selected.size === 0 ? "All People"
    : selected.size === 1 ? (options.find(o => selected.has(o.id))?.name ?? "1 person")
    : `${selected.size} people`;

  const active = selected.size > 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border transition-colors ${active ? "border-sky-400 bg-sky-50 text-sky-700" : "border-stone-200 text-stone-600 hover:border-sky-300"}`}
      >
        <Users className="w-3 h-3 opacity-70" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 w-72 bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-stone-100 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Filter by Person
          </div>
          {options.length === 0 ? (
            <p className="px-3 py-4 text-xs text-stone-400 text-center">No owners in current data.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {options.map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-stone-50 border-b border-stone-50 last:border-0"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selected.has(o.id) ? "bg-sky-500 border-sky-500" : "border-stone-300 bg-white"}`}>
                    {selected.has(o.id) && <span className="text-white text-[10px] leading-none">✓</span>}
                  </span>
                  <span className="flex-1 text-xs text-stone-700 truncate">{o.name}</span>
                  {o.designation && (
                    <span className={`text-[10px] px-1 py-0.5 rounded font-medium ${DESIGNATION_COLOR[o.designation] ?? "bg-stone-100 text-stone-500"}`}>
                      {o.designation}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {active && (
            <div className="border-t border-stone-100 px-3 py-2">
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="w-full text-xs text-stone-400 hover:text-stone-600 py-1 text-center"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Admin: Team Health tab ─────────────────────────────────────────────────────

