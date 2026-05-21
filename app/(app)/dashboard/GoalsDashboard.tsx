"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Target, ChevronRight, ChevronDown, Layers, LayoutDashboard, ListChecks,
  MessageSquare, Home, Users, AlertTriangle, CheckCircle2, Flag, GitBranch,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import { GoalStatusBadge } from "@/components/StatusBadge";
import CreateGoalModal from "./CreateGoalModal";
import TemplatePickerModal from "@/components/TemplatePickerModal";
import { qk } from "@/lib/query-keys";
import { fetchGoal, fetchGoals } from "@/lib/api-client";
import OrgOverview, { type OverviewData } from "./OrgOverview";
import GeoFilter, { type GeoFilterValue } from "@/components/GeoFilter";
import MultiSelect from "@/components/MultiSelect";

// ── Types ─────────────────────────────────────────────────────────────────────

type CityRef = { id: string; name: string };
type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  needsDomain: string | null;
  parameter: number | null;
  owner: { id: string; name: string | null; image: string | null };
  pitstops: { id: string; status: string }[];
  programs: { program: { id: string; title: string } }[];
  needsCity: CityRef | null;
  needsZone: { id: string; name: string; city: CityRef | null } | null;
  needsCluster: { id: string; name: string; zone: { id: string; name: string; city: CityRef | null } } | null;
  coOwners?: { userId: string }[];
};

type GeoRef = { id: string; title: string; needsDomain: string | null; needsZoneId: string | null; needsClusterId: string | null };
type Thread = {
  id: string;
  name: string;
  updatedAt: string;
  pitstopId: string | null;
  goalId: string | null;
  eventId: string | null;
  pitstop: {
    id: string; title: string;
    goal: GeoRef & { title: string };
    owner: { id: string; name: string | null; image: string | null } | null;
  } | null;
  goal: (GeoRef & { title: string; owner: { id: string; name: string | null; image: string | null } | null }) | null;
  event: {
    id: string; title: string; scheduledAt: string;
    pitstops: { pitstop: { goal: GeoRef & { title: string } } }[];
  } | null;
  _count: { messages: number };
  messages: { body: string; createdAt: string; author: { name: string | null } }[];
};

type MyPitstop = {
  id: string; title: string; status: string; targetDate: string | null;
  goal: { id: string; title: string };
  checklistItems: { id: string; checked: boolean }[];
};

interface SearchResults {
  query: string;
  goals: Goal[];
  pitstops: { id: string; title: string; goal: { id: string; title: string } }[];
}

type PhaseRow = {
  id: string; goalId: string; goalTitle: string; title: string; progressTag: string | null; status: string;
  targetDate: string | null; startDate: string | null;
  ownerId: string | null; ownerName: string | null; ownerDesignation: string | null;
  checklistTotal: number; checklistDone: number;
  activityTotal: number; activityDone: number;
};

type ChecklistDrillItem = {
  id: string;
  text: string;
  checked: boolean;
  status: string;
  activities: { id: string; title: string; status: string; scheduledAt: string; type: string }[];
};

type DrillState = { tag: PhaseTag; seedGoalId?: string } | null;

const PHASE_TAGS = ["Team", "Baseline", "Permissions", "Infrastructure", "Training", "Live", "Monitoring"] as const;
type PhaseTag = typeof PHASE_TAGS[number];

const PHASE_COLORS: Record<PhaseTag, { pill: string; filled: string }> = {
  Team:           { pill: "bg-stone-50 text-stone-700 border-stone-200",   filled: "bg-stone-500" },
  Baseline:       { pill: "bg-sky-50 text-sky-700 border-sky-200",         filled: "bg-sky-500" },
  Permissions:    { pill: "bg-amber-50 text-amber-700 border-amber-200",   filled: "bg-amber-500" },
  Infrastructure: { pill: "bg-violet-50 text-violet-700 border-violet-200", filled: "bg-violet-500" },
  Training:       { pill: "bg-teal-50 text-teal-700 border-teal-200",      filled: "bg-teal-500" },
  Live:           { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", filled: "bg-emerald-500" },
  Monitoring:     { pill: "bg-rose-50 text-rose-700 border-rose-200",      filled: "bg-rose-500" },
};

interface Props {
  initialGoals: Goal[];
  currentUserId: string;
  currentUserDesignation?: string;
  currentUserRole?: string;
  searchResults: SearchResults | null;
  users: { id: string; name: string | null; image: string | null; designation?: string; reportsToId?: string | null }[];
  programs: { id: string; title: string }[];
  threads: Thread[];
  myPitstops: MyPitstop[];
  overviewData: OverviewData;
  phaseData?: PhaseRow[];
  initialTab: "home" | "goals" | "team" | "phase";
  initialFilter?: "All" | "Mine" | "Active" | "Paused" | "Complete";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Thread tile ───────────────────────────────────────────────────────────────

const LEVEL_BADGE: Record<string, { label: string; cls: string }> = {
  goal:     { label: "Goal",     cls: "bg-violet-50 text-violet-600 border-violet-200" },
  pitstop:  { label: "Pitstop",  cls: "bg-sky-50 text-sky-600 border-sky-200" },
  activity: { label: "Activity", cls: "bg-amber-50 text-amber-600 border-amber-200" },
};

function getThreadHref(thread: Thread): string {
  if (thread.goalId && thread.goal) return `/goals/${thread.goal.id}`;
  if (thread.eventId) return `/activities`;
  if (thread.pitstop) return `/goals/${thread.pitstop.goal.id}/pitstops/${thread.pitstop.id}?thread=${thread.id}`;
  return "/threads";
}

function getThreadBreadcrumb(thread: Thread): string {
  if (thread.goal) return thread.goal.title;
  if (thread.pitstop) return `${thread.pitstop.goal.title} › ${thread.pitstop.title}`;
  if (thread.event) return thread.event.title;
  return "";
}

function getThreadOwner(thread: Thread) {
  if (thread.goal?.owner) return thread.goal.owner;
  if (thread.pitstop?.owner) return thread.pitstop.owner;
  return null;
}

function getThreadLevel(thread: Thread): "goal" | "pitstop" | "activity" {
  if (thread.goalId) return "goal";
  if (thread.eventId) return "activity";
  return "pitstop";
}

function ThreadTile({ thread }: { thread: Thread }) {
  const lastMsg = thread.messages[0];
  const level = getThreadLevel(thread);
  const badge = LEVEL_BADGE[level];
  const owner = getThreadOwner(thread);

  return (
    <Link
      href={getThreadHref(thread)}
      className="flex flex-col bg-white border border-stone-200 rounded-xl p-4 hover:border-sky-300 hover:shadow-sm transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-sky-50 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <span className="text-sm font-semibold text-stone-800 group-hover:text-sky-700 line-clamp-1">{thread.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          <span className="text-[11px] text-stone-400">{timeAgo(thread.updatedAt)}</span>
        </div>
      </div>

      {/* Breadcrumb */}
      <p className="text-[11px] text-stone-400 mb-2 truncate">{getThreadBreadcrumb(thread)}</p>

      {/* Last message */}
      {lastMsg ? (
        <p className="text-xs text-stone-500 line-clamp-2 flex-1">
          <span className="font-medium text-stone-600">{lastMsg.author.name}:</span>{" "}
          {lastMsg.body}
        </p>
      ) : (
        <p className="text-xs text-stone-400 italic flex-1">No messages yet</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-stone-100">
        <span className="flex items-center gap-1 text-[11px] text-stone-400">
          <MessageSquare className="w-3 h-3" />
          {thread._count.messages}
        </span>
        {owner && (
          <div className="flex items-center gap-1">
            <Avatar name={owner.name} image={owner.image} size="xs" />
            <span className="text-[11px] text-stone-400 truncate max-w-[80px]">{owner.name}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

// ── My pitstop row ────────────────────────────────────────────────────────────

function MyPitstopRow({ pitstop }: { pitstop: MyPitstop }) {
  const total = pitstop.checklistItems.length;
  const done = pitstop.checklistItems.filter(i => i.checked).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  const overdue = pitstop.targetDate && new Date(pitstop.targetDate) < new Date();

  return (
    <Link
      href={`/goals/${pitstop.goal.id}/pitstops/${pitstop.id}`}
      className="flex items-center gap-3 px-4 py-2.5 bg-white border border-stone-200 rounded-lg hover:border-stone-300 hover:shadow-sm transition-all group"
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pitstop.status === "InProgress" ? "bg-sky-400" : "bg-stone-300"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-stone-800 truncate group-hover:text-sky-700">{pitstop.title}</p>
        <p className="text-[11px] text-stone-400 truncate">{pitstop.goal.title}</p>
        {pct !== null && (
          <div className="flex items-center gap-1.5 mt-1">
            <div className="w-20 h-1 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-stone-400">{done}/{total}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {pitstop.targetDate && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${overdue ? "bg-red-50 border-red-200 text-red-600" : "bg-stone-50 border-stone-200 text-stone-500"}`}>
            {fmtDate(pitstop.targetDate)}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-stone-500" />
      </div>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type ClusterNode = { id: string; name: string; goals: Goal[] };
type ZoneNode = { id: string; name: string; goals: Goal[]; clusters: Record<string, ClusterNode> };
type CityNode = { id: string; name: string; goals: Goal[]; zones: Record<string, ZoneNode> };
type GeoTree = { cities: Record<string, CityNode>; noGeo: Goal[] };

function buildGeoTree(goals: Goal[]): GeoTree {
  const cities: Record<string, CityNode> = {};
  const noGeo: Goal[] = [];

  function getCity(ref: CityRef): CityNode {
    if (!cities[ref.id]) cities[ref.id] = { id: ref.id, name: ref.name, goals: [], zones: {} };
    return cities[ref.id];
  }
  function getZone(city: CityNode, zone: { id: string; name: string }): ZoneNode {
    if (!city.zones[zone.id]) city.zones[zone.id] = { id: zone.id, name: zone.name, goals: [], clusters: {} };
    return city.zones[zone.id];
  }

  for (const g of goals) {
    if (g.needsCluster) {
      const zoneRef = g.needsCluster.zone;
      if (!zoneRef) { noGeo.push(g); continue; }
      const cityRef = zoneRef.city;
      if (cityRef) {
        const city = getCity(cityRef);
        const zone = getZone(city, zoneRef);
        if (!zone.clusters[g.needsCluster.id]) zone.clusters[g.needsCluster.id] = { id: g.needsCluster.id, name: g.needsCluster.name, goals: [] };
        zone.clusters[g.needsCluster.id].goals.push(g);
      } else {
        // cluster with no city — synthetic city from zone name
        const syntheticCity: CityRef = { id: `zone-${zoneRef.id}`, name: zoneRef.name };
        const city = getCity(syntheticCity);
        const zone = getZone(city, zoneRef);
        if (!zone.clusters[g.needsCluster.id]) zone.clusters[g.needsCluster.id] = { id: g.needsCluster.id, name: g.needsCluster.name, goals: [] };
        zone.clusters[g.needsCluster.id].goals.push(g);
      }
    } else if (g.needsZone) {
      const cityRef = g.needsZone.city;
      if (cityRef) {
        const city = getCity(cityRef);
        const zone = getZone(city, g.needsZone);
        zone.goals.push(g);
      } else {
        const syntheticCity: CityRef = { id: `zone-${g.needsZone.id}`, name: g.needsZone.name };
        const city = getCity(syntheticCity);
        const zone = getZone(city, g.needsZone);
        zone.goals.push(g);
      }
    } else if (g.needsCity) {
      const city = getCity(g.needsCity);
      city.goals.push(g);
    } else {
      noGeo.push(g);
    }
  }

  return { cities, noGeo };
}

export default function GoalsDashboard({
  initialGoals, currentUserId, currentUserDesignation = "Other", currentUserRole, searchResults, users, programs,
  threads, myPitstops, overviewData, phaseData = [], initialTab, initialFilter = "All",
}: Props) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isMounted = useRef(false);

  const [activeTab, setActiveTab] = useState<"home" | "goals" | "team" | "phase">(
    (searchParams.get("tab") as "home" | "goals" | "team" | "phase") || initialTab
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [filter, setFilter] = useState<"All" | "Mine" | "Active" | "Paused" | "Complete">(
    (searchParams.get("filter") as "All" | "Mine" | "Active" | "Paused" | "Complete") || initialFilter
  );
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(
    searchParams.get("programs")?.split(",").filter(Boolean) ?? []
  );
  const [selectedUsers, setSelectedUsers] = useState<string[]>(
    searchParams.get("users")?.split(",").filter(Boolean) ?? []
  );
  const [geoFilter, setGeoFilter] = useState<GeoFilterValue>({
    cityId:    searchParams.get("city")    ?? "",
    zoneId:    searchParams.get("zone")    ?? "",
    clusterId: searchParams.get("cluster") ?? "",
  });
  const [groupByGeo, setGroupByGeo] = useState(searchParams.get("group") === "1");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Sync filter state → URL so navigating back restores filters
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    const params = new URLSearchParams();
    if (activeTab !== "home")           params.set("tab",      activeTab);
    if (filter !== "All")               params.set("filter",   filter);
    if (selectedPrograms.length > 0)    params.set("programs", selectedPrograms.join(","));
    if (selectedUsers.length > 0)       params.set("users",    selectedUsers.join(","));
    if (geoFilter.cityId)               params.set("city",     geoFilter.cityId);
    if (geoFilter.zoneId)               params.set("zone",     geoFilter.zoneId);
    if (geoFilter.clusterId)            params.set("cluster",  geoFilter.clusterId);
    if (groupByGeo)                     params.set("group",    "1");
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [activeTab, filter, selectedPrograms, selectedUsers, geoFilter, groupByGeo]);

  const { data: goals = initialGoals } = useQuery<Goal[]>({
    queryKey: qk.goals(),
    queryFn: fetchGoals,
    initialData: initialGoals,
    initialDataUpdatedAt: 0,
  });

  // Treat co-owners as owners — "Mine" and "My Goals" should include goals
  // I co-own, not just goals where I'm the primary owner.
  const isMine = (g: { owner: { id: string }; coOwners?: { userId: string }[] }) =>
    g.owner.id === currentUserId || (g.coOwners ?? []).some(co => co.userId === currentUserId);

  const filtered = goals.filter((g) => {
    if (filter === "Mine" && !isMine(g)) return false;
    if (filter === "Active" && g.status !== "Active") return false;
    if (filter === "Paused" && g.status !== "Paused") return false;
    if (filter === "Complete" && g.status !== "Complete") return false;
    if (selectedPrograms.length > 0 && !g.programs.some((pg) => selectedPrograms.includes(pg.program.id))) return false;
    if (selectedUsers.length > 0 && !selectedUsers.includes(g.owner.id) && !g.coOwners?.some((co: { userId: string }) => selectedUsers.includes(co.userId))) return false;
    if (geoFilter.clusterId) return g.needsCluster?.id === geoFilter.clusterId;
    if (geoFilter.zoneId) return g.needsZone?.id === geoFilter.zoneId || g.needsCluster?.zone?.id === geoFilter.zoneId;
    if (geoFilter.cityId) return g.needsCity?.id === geoFilter.cityId || g.needsZone?.city?.id === geoFilter.cityId || g.needsCluster?.zone?.city?.id === geoFilter.cityId;
    return true;
  });

  const myGoals = filtered.filter(isMine);
  const teamGoals = filtered.filter((g) => !isMine(g));

  const prefetchGoal = (goalId: string) => {
    queryClient.prefetchQuery({
      queryKey: qk.goal(goalId),
      queryFn: () => fetchGoal(goalId),
      staleTime: 30 * 1000,
    });
    router.prefetch(`/goals/${goalId}`);
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  // Derived stat pill values
  const overdueCount = overviewData.overduePitstops.length;
  const inProgressCount = overviewData.inProgressPitstops.length;
  const doneThisMonth = overviewData.doneThisMonth;
  const activeGoals = goals.filter(g => g.status === "Active").length;

  const homeThreads = threads.slice(0, 12);

  // ── Search results ───────────────────────────────────────────────────────────
  if (searchResults) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="mb-8">
          <p className="text-sm text-stone-500 mb-1">Search results for</p>
          <h1 className="text-xl font-semibold text-stone-900">"{searchResults.query}"</h1>
        </div>

        {searchResults.goals.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Goals</h2>
            <div className="space-y-2">
              {searchResults.goals.map((g) => (
                <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />
              ))}
            </div>
          </section>
        )}

        {searchResults.pitstops.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Pitstops</h2>
            <div className="space-y-2">
              {searchResults.pitstops.map((p) => (
                <Link
                  key={p.id}
                  href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 bg-white rounded-lg border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all group"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900">{p.title}</p>
                    <p className="text-xs text-stone-500 mt-0.5">in {p.goal.title}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-600" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {searchResults.goals.length === 0 && searchResults.pitstops.length === 0 && (
          <p className="text-stone-500 text-sm">No results found.</p>
        )}
      </div>
    );
  }

  // ── Main layout ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

      {/* Stat pills — always visible */}
      <div className="flex flex-wrap gap-2 mb-6">
        <StatPill
          icon={<Flag className="w-3 h-3" />}
          label="active goals"
          value={activeGoals}
          accent="sky"
          href="/dashboard?tab=goals&filter=Active"
        />
        <StatPill
          icon={<CheckCircle2 className="w-3 h-3" />}
          label="in progress"
          value={inProgressCount}
          accent="stone"
        />
        <StatPill
          icon={<AlertTriangle className="w-3 h-3" />}
          label="overdue"
          value={overdueCount}
          accent={overdueCount > 0 ? "red" : "stone"}
          href="/dashboard?tab=team"
        />
        <StatPill
          icon={<CheckCircle2 className="w-3 h-3" />}
          label="done this month"
          value={doneThisMonth}
          accent="emerald"
        />
      </div>

      {/* Tab bar + actions */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex gap-0.5 bg-stone-100 rounded-lg p-0.5 w-fit">
          {(
            [
              { key: "home",  label: "Home",  icon: <Home className="w-3.5 h-3.5" />,      show: true },
              { key: "goals", label: "Goals", icon: <ListChecks className="w-3.5 h-3.5" />, show: true },
              { key: "team",  label: "Team",  icon: <Users className="w-3.5 h-3.5" />,      show: currentUserDesignation !== "RP" },
              { key: "phase", label: "Phase", icon: <GitBranch className="w-3.5 h-3.5" />,  show: currentUserDesignation !== "RP" },
            ] as { key: "home" | "goals" | "team" | "phase"; label: string; icon: React.ReactNode; show: boolean }[]
          ).filter(t => t.show).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === key ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>

        {activeTab === "goals" && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setGroupByGeo(g => !g)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${groupByGeo ? "bg-sky-100 text-sky-700 border border-sky-200" : "bg-stone-100 hover:bg-stone-200 text-stone-700"}`}
            >
              <Layers className="w-4 h-4" />
              {groupByGeo ? "Grouped" : "Group"}
            </button>
            <button
              onClick={() => setShowTemplate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Goal
            </button>
          </div>
        )}
      </div>

      {/* ── Home tab ── */}
      {activeTab === "home" && (
        <div className="space-y-8">

          {/* Active threads grid */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                Active Threads
              </h2>
              <Link href="/threads" className="text-xs text-sky-600 hover:text-sky-700 font-medium">
                View all →
              </Link>
            </div>

            {threads.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-stone-200 rounded-xl">
                <MessageSquare className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                <p className="text-sm text-stone-400">No threads yet — discussions start inside goals, pitstops, or activities.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {homeThreads.map((t) => <ThreadTile key={t.id} thread={t} />)}
              </div>
            )}
          </section>

          {/* My pitstops */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <LayoutDashboard className="w-3.5 h-3.5" />
                My Pitstops
              </h2>
            </div>

            {myPitstops.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-stone-200 rounded-xl">
                <p className="text-sm text-stone-400">No active pitstops assigned to you.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {myPitstops.map((p) => <MyPitstopRow key={p.id} pitstop={p} />)}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ── Goals tab ── */}
      {activeTab === "goals" && (
        <div>
          <div className="flex flex-wrap gap-1 mb-4">
            {(["All", "Mine", "Active", "Paused", "Complete"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  filter === f
                    ? "bg-stone-900 text-white"
                    : "text-stone-500 hover:text-stone-700 hover:bg-stone-100"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mb-6">
            {programs.length > 0 && (
              <MultiSelect
                options={programs.map((p) => ({ value: p.id, label: p.title }))}
                value={selectedPrograms}
                onChange={setSelectedPrograms}
                placeholder="All Programs"
              />
            )}
            {users.length > 0 && (
              <MultiSelect
                options={users.map((u) => ({ value: u.id, label: u.name ?? u.id }))}
                value={selectedUsers}
                onChange={setSelectedUsers}
                placeholder="All Members"
              />
            )}
            <GeoFilter value={geoFilter} onChange={setGeoFilter} compact />
            {(selectedPrograms.length > 0 || selectedUsers.length > 0 || geoFilter.cityId || geoFilter.zoneId || geoFilter.clusterId) && (
              <button
                onClick={() => { setSelectedPrograms([]); setSelectedUsers([]); setGeoFilter({ cityId: "", zoneId: "", clusterId: "" }); }}
                className="px-2.5 py-1 text-xs text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-md transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            filter === "All" && selectedPrograms.length === 0 && selectedUsers.length === 0 ? (
              <div className="text-center py-20">
                <Target className="w-10 h-10 text-stone-200 mx-auto mb-3" />
                <p className="text-stone-500 font-medium">No goals yet</p>
                <p className="text-xs text-stone-400 mt-1">Create your first goal to get started.</p>
                <button onClick={() => setShowTemplate(true)} className="mt-4 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600">
                  Create Goal
                </button>
              </div>
            ) : (
              <p className="text-center text-stone-400 text-sm py-16">No goals match your filters.</p>
            )
          ) : groupByGeo ? (
            (() => {
              const tree = buildGeoTree(filtered);
              return (
                <div className="space-y-2">
                  {Object.values(tree.cities).map((city) => {
                    const cityKey = `city:${city.id}`;
                    const cityOpen = expandedGroups.has(cityKey);
                    const cityGoalCount = city.goals.length +
                      Object.values(city.zones).reduce((s, z) => s + z.goals.length + Object.values(z.clusters).reduce((cs, cl) => cs + cl.goals.length, 0), 0);
                    return (
                      <div key={city.id} className="rounded-xl border border-stone-200 overflow-hidden">
                        <button
                          onClick={() => toggleGroup(cityKey)}
                          className="w-full flex items-center gap-2 px-4 py-2.5 bg-stone-100 hover:bg-stone-200 transition-colors text-left"
                        >
                          {cityOpen ? <ChevronDown className="w-4 h-4 text-stone-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-500 flex-shrink-0" />}
                          <span className="text-sm font-bold text-stone-800">{city.name}</span>
                          <span className="ml-auto text-xs text-stone-500">{cityGoalCount} goal{cityGoalCount !== 1 ? "s" : ""}</span>
                        </button>
                        {cityOpen && (
                          <div className="bg-white divide-y divide-stone-50">
                            {/* City-level goals */}
                            {city.goals.length > 0 && (
                              <div className="px-4 py-2 space-y-1.5">
                                {city.goals.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
                              </div>
                            )}
                            {/* Zones */}
                            {Object.values(city.zones).map((zone) => {
                              const zoneKey = `zone:${zone.id}`;
                              const zoneOpen = expandedGroups.has(zoneKey);
                              const zoneGoalCount = zone.goals.length + Object.values(zone.clusters).reduce((s, cl) => s + cl.goals.length, 0);
                              return (
                                <div key={zone.id}>
                                  <button
                                    onClick={() => toggleGroup(zoneKey)}
                                    className="w-full flex items-center gap-2 px-6 py-2 bg-stone-50 hover:bg-stone-100 transition-colors text-left"
                                  >
                                    {zoneOpen ? <ChevronDown className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />}
                                    <span className="text-xs font-semibold text-stone-700">{zone.name}</span>
                                    <span className="text-[10px] text-stone-400 bg-stone-200 rounded-full px-1.5 py-0.5">Zone</span>
                                    <span className="ml-auto text-xs text-stone-400">{zoneGoalCount}</span>
                                  </button>
                                  {zoneOpen && (
                                    <div className="bg-white divide-y divide-stone-50">
                                      {/* Zone-level goals */}
                                      {zone.goals.length > 0 && (
                                        <div className="px-6 py-2 space-y-1.5">
                                          {zone.goals.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
                                        </div>
                                      )}
                                      {/* Clusters */}
                                      {Object.values(zone.clusters).map((cluster) => {
                                        const clusterKey = `cluster:${cluster.id}`;
                                        const clusterOpen = expandedGroups.has(clusterKey);
                                        return (
                                          <div key={cluster.id}>
                                            <button
                                              onClick={() => toggleGroup(clusterKey)}
                                              className="w-full flex items-center gap-2 px-8 py-1.5 bg-white hover:bg-stone-50 transition-colors text-left border-l-2 border-stone-100"
                                            >
                                              {clusterOpen ? <ChevronDown className="w-3 h-3 text-stone-300 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-stone-300 flex-shrink-0" />}
                                              <span className="text-xs text-stone-600 font-medium">{cluster.name}</span>
                                              <span className="text-[10px] text-stone-400 bg-stone-100 rounded-full px-1.5 py-0.5">Cluster</span>
                                              <span className="ml-auto text-xs text-stone-400">{cluster.goals.length}</span>
                                            </button>
                                            {clusterOpen && (
                                              <div className="px-8 py-2 space-y-1.5 bg-white border-l-2 border-stone-100">
                                                {cluster.goals.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* No geography */}
                  {tree.noGeo.length > 0 && (
                    <div className="rounded-xl border border-dashed border-stone-200 overflow-hidden">
                      <button
                        onClick={() => toggleGroup("no-geo")}
                        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-stone-50 transition-colors text-left"
                      >
                        {expandedGroups.has("no-geo") ? <ChevronDown className="w-4 h-4 text-stone-300 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0" />}
                        <span className="text-sm text-stone-400">No Geography</span>
                        <span className="ml-auto text-xs text-stone-400">{tree.noGeo.length}</span>
                      </button>
                      {expandedGroups.has("no-geo") && (
                        <div className="px-4 pb-2 space-y-1.5">
                          {tree.noGeo.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <>
              {myGoals.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">My Goals</h2>
                  <div className="space-y-2">
                    {myGoals.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
                  </div>
                </section>
              )}
              {teamGoals.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Team Goals</h2>
                  <div className="space-y-2">
                    {teamGoals.map((g) => <GoalCard key={g.id} goal={g} onHover={prefetchGoal} />)}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Team tab (OrgOverview) ── */}
      {activeTab === "team" && (
        <OrgOverview overviewData={overviewData} goals={goals} users={users} />
      )}

      {/* ── Phase tab ── */}
      {activeTab === "phase" && (
        <PhaseMatrix goals={filtered} phaseData={phaseData} users={users} />
      )}

      {showCreate && (
        <CreateGoalModal
          onClose={() => setShowCreate(false)}
          onCreated={(goal) => {
            queryClient.setQueryData<Goal[]>(qk.goals(), (old = []) => [goal as Goal, ...old]);
            setShowCreate(false);
          }}
        />
      )}

      {showTemplate && (
        <TemplatePickerModal
          onClose={() => setShowTemplate(false)}
          onCreated={(goal) => {
            queryClient.setQueryData<Goal[]>(qk.goals(), (old = []) => [goal as Goal, ...old]);
            setShowTemplate(false);
          }}
          currentUserId={currentUserId}
          currentUserDesignation={currentUserDesignation}
          currentUserRole={currentUserRole}
          allUsers={users}
        />
      )}
    </div>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────

function StatPill({
  icon, label, value, accent, href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: "sky" | "red" | "emerald" | "stone";
  href?: string;
}) {
  const colors = {
    sky:     "bg-sky-50 border-sky-200 text-sky-700",
    red:     "bg-red-50 border-red-200 text-red-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    stone:   "bg-white border-stone-200 text-stone-600",
  };
  const cls = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${colors[accent]}${href ? " hover:shadow-sm transition-shadow cursor-pointer" : ""}`;
  const inner = (
    <>
      {icon}
      <span className="font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
    </>
  );
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <div className={cls}>{inner}</div>;
}

// ── Goal card ─────────────────────────────────────────────────────────────────

function GoalCard({ goal, onHover }: { goal: Goal; onHover: (id: string) => void }) {
  const total = goal.pitstops.length;
  const done = goal.pitstops.filter((p) => p.status === "Done").length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const incomplete = !goal.needsDomain;

  return (
    <Link
      href={`/goals/${goal.id}`}
      onMouseEnter={() => onHover(goal.id)}
      onTouchStart={() => onHover(goal.id)}
      className="flex items-center gap-4 px-4 py-3.5 bg-white rounded-lg border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm font-medium text-stone-900 truncate">{goal.title}</p>
          <GoalStatusBadge status={goal.status} />
          {incomplete && (
            <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-600 rounded-full flex-shrink-0">
              <AlertTriangle className="w-2.5 h-2.5" /> No domain linked
            </span>
          )}
        </div>
        {goal.description && (
          <p className="text-xs text-stone-500 truncate">{goal.description}</p>
        )}
        {total > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-sky-400 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-stone-400">{done}/{total}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Avatar name={goal.owner.name} image={goal.owner.image} size="sm" />
        <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-stone-600" />
      </div>
    </Link>
  );
}

// ── Phase Matrix ──────────────────────────────────────────────────────────────

const CHECKLIST_STATUS_COLORS: Record<string, string> = {
  Done:       "bg-emerald-100 text-emerald-700",
  InProgress: "bg-sky-100 text-sky-700",
  Scheduled:  "bg-amber-100 text-amber-700",
  Blocked:    "bg-red-100 text-red-700",
  Cancelled:  "bg-stone-100 text-stone-400",
  Rescheduled:"bg-violet-100 text-violet-700",
  NotStarted: "bg-stone-100 text-stone-400",
};
const EVENT_STATUS_COLORS: Record<string, string> = {
  Done:       "bg-emerald-100 text-emerald-700",
  Scheduled:  "bg-sky-100 text-sky-700",
  Cancelled:  "bg-stone-100 text-stone-400",
  Flagged:    "bg-red-100 text-red-700",
  Rescheduled:"bg-violet-100 text-violet-700",
};

type UserRef = { id: string; name: string | null; image: string | null; designation?: string };

function PitstopDrillCard({
  row, users, expanded, onToggle, checklistItems, loadingChecklist,
}: {
  row: PhaseRow;
  users: UserRef[];
  expanded: boolean;
  onToggle: () => void;
  checklistItems: ChecklistDrillItem[] | undefined;
  loadingChecklist: boolean;
}) {
  const [expandedChecklist, setExpandedChecklist] = useState<string | null>(null);
  const ownerImage = users.find(u => u.id === row.ownerId)?.image ?? null;
  const clPct = row.checklistTotal > 0 ? Math.round((row.checklistDone / row.checklistTotal) * 100) : null;
  const actPct = row.activityTotal > 0 ? Math.round((row.activityDone / row.activityTotal) * 100) : null;
  const statusCls =
    row.status === "Done" ? "bg-emerald-50 text-emerald-700" :
    row.status === "InProgress" ? "bg-sky-50 text-sky-700" :
    "bg-stone-50 text-stone-500";

  return (
    <div className="rounded-lg border border-stone-100 overflow-hidden">
      <div
        className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer select-none transition-colors ${expanded ? "bg-stone-50" : "bg-white hover:bg-stone-50"}`}
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${statusCls}`}>{row.status}</span>
            <span className="text-xs font-medium text-stone-700 line-clamp-1 flex-1">{row.title}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {row.ownerName && (
              <div className="flex items-center gap-1">
                <Avatar name={row.ownerName} image={ownerImage} size="xs" />
                <span className="text-[10px] text-stone-500">{row.ownerName}</span>
                {row.ownerDesignation && (
                  <span className="text-[9px] text-stone-400 bg-stone-100 px-1 py-0.5 rounded">{row.ownerDesignation}</span>
                )}
              </div>
            )}
            {row.targetDate && (
              <span className="text-[10px] text-stone-400">
                Due {new Date(row.targetDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            )}
          </div>
          {(clPct !== null || actPct !== null) && (
            <div className="flex items-center gap-3 pt-0.5">
              {clPct !== null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-sky-400 rounded-full" style={{ width: `${clPct}%` }} />
                  </div>
                  <span className="text-[9px] text-stone-400">{row.checklistDone}/{row.checklistTotal} tasks</span>
                </div>
              )}
              {actPct !== null && (
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${actPct}%` }} />
                  </div>
                  <span className="text-[9px] text-stone-400">{row.activityDone}/{row.activityTotal} acts</span>
                </div>
              )}
            </div>
          )}
        </div>
        {expanded ? <ChevronDown className="w-3 h-3 text-stone-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-3 h-3 text-stone-300 flex-shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="border-t border-stone-100 bg-stone-50 px-3 py-2 space-y-1">
          {loadingChecklist && <p className="text-xs text-stone-400 py-1">Loading…</p>}
          {!loadingChecklist && checklistItems !== undefined && checklistItems.length === 0 && (
            <p className="text-xs text-stone-400 py-1">No checklist items</p>
          )}
          {!loadingChecklist && checklistItems && checklistItems.length > 0 && checklistItems.map(item => {
            const cColor = CHECKLIST_STATUS_COLORS[item.status] ?? "bg-stone-100 text-stone-400";
            const isChecklistExpanded = expandedChecklist === item.id;
            return (
              <div key={item.id}>
                <div
                  className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer select-none transition-colors ${isChecklistExpanded ? "bg-white" : "hover:bg-white"}`}
                  onClick={() => setExpandedChecklist(prev => prev === item.id ? null : item.id)}
                >
                  <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5 ${cColor}`}>
                    {item.status === "NotStarted" ? "Not Started" : item.status}
                  </span>
                  <span className={`text-xs flex-1 min-w-0 ${item.checked ? "line-through text-stone-400" : "text-stone-600"}`}>
                    {item.text}
                  </span>
                  {item.activities.length > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0 mt-1.5" title="Has linked activities" />
                  )}
                </div>
                {isChecklistExpanded && (
                  <div className="ml-2 mt-0.5 mb-1 px-3 py-2 bg-white rounded-lg border border-stone-100">
                    {item.activities.length > 0 ? (
                      <div className="space-y-1.5">
                        {item.activities.map((act) => (
                          <div key={act.id} className="flex items-center gap-2">
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${EVENT_STATUS_COLORS[act.status] ?? "bg-stone-100 text-stone-400"}`}>
                              {act.status}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-stone-700 truncate">{act.title}</p>
                              <p className="text-[10px] text-stone-400">
                                {act.type} · {new Date(act.scheduledAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400">No activities linked to this item</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DRILL_SECTIONS = [
  { key: "Overdue" as const, label: "Overdue",           headerCls: "text-red-700 bg-red-50 border-red-100",    dotCls: "bg-red-500" },
  { key: "AtRisk"  as const, label: "At Risk (≤14 days)", headerCls: "text-amber-700 bg-amber-50 border-amber-100", dotCls: "bg-amber-400" },
  { key: "OnTrack" as const, label: "On Track",           headerCls: "text-sky-700 bg-sky-50 border-sky-100",    dotCls: "bg-sky-400" },
  { key: "Done"    as const, label: "Done",               headerCls: "text-emerald-700 bg-emerald-50 border-emerald-100", dotCls: "bg-emerald-500" },
];

function DrillDownPanel({
  drill, phaseData, goals, users, onClose,
}: {
  drill: NonNullable<DrillState>;
  phaseData: PhaseRow[];
  goals: Goal[];
  users: UserRef[];
  onClose: () => void;
}) {
  const [filterGoalId, setFilterGoalId] = useState(drill.seedGoalId ?? "");
  const [filterUserId, setFilterUserId] = useState("");
  const [filterDesig, setFilterDesig]   = useState("");
  const [expandedPitstop, setExpandedPitstop] = useState<string | null>(null);
  const [checklistMap, setChecklistMap] = useState<Record<string, ChecklistDrillItem[]>>({});
  const [loadingPitstop, setLoadingPitstop] = useState<string | null>(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const atRiskCutoff = new Date(today); atRiskCutoff.setDate(today.getDate() + 14);

  const tagRows = phaseData.filter(r => r.progressTag === drill.tag);

  const filtered = tagRows.filter(r => {
    if (filterGoalId && r.goalId !== filterGoalId) return false;
    if (filterUserId && r.ownerId !== filterUserId) return false;
    if (filterDesig && r.ownerDesignation !== filterDesig) return false;
    return true;
  });

  const grouped = {
    Overdue: filtered.filter(r => r.status !== "Done" && r.targetDate && new Date(r.targetDate) < today),
    AtRisk:  filtered.filter(r => r.status !== "Done" && r.targetDate && new Date(r.targetDate) >= today && new Date(r.targetDate) <= atRiskCutoff),
    OnTrack: filtered.filter(r => r.status !== "Done" && (!r.targetDate || new Date(r.targetDate) > atRiskCutoff)),
    Done:    filtered.filter(r => r.status === "Done"),
  };

  const overdueByOwner = new Map<string, { name: string | null; designation: string | null; count: number }>();
  for (const r of grouped.Overdue) {
    if (!r.ownerId) continue;
    const cur = overdueByOwner.get(r.ownerId) ?? { name: r.ownerName, designation: r.ownerDesignation, count: 0 };
    cur.count++;
    overdueByOwner.set(r.ownerId, cur);
  }
  const topDelayers = [...overdueByOwner.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 3);

  // Build dropdown options from tagRows directly — they carry goalTitle/ownerName/ownerDesignation
  // so the dropdowns are always fully populated regardless of how `goals`/`users` are scoped.
  const goalDropdown = [...new Map(tagRows.map(r => [r.goalId, r.goalTitle])).entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  const ownerDropdown = [...new Map(
    tagRows
      .filter(r => r.ownerId && r.ownerName)
      .map(r => [r.ownerId!, { id: r.ownerId!, name: r.ownerName!, designation: r.ownerDesignation }])
  ).values()].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

  const availableDesigs = [...new Set(
    tagRows.map(r => r.ownerDesignation).filter(Boolean)
  )] as string[];

  const togglePitstop = async (pitstopId: string) => {
    if (expandedPitstop === pitstopId) { setExpandedPitstop(null); return; }
    setExpandedPitstop(pitstopId);
    if (!checklistMap[pitstopId]) {
      setLoadingPitstop(pitstopId);
      const res  = await fetch(`/api/pitstops/${pitstopId}/checklist`);
      const data = await res.json();
      setChecklistMap(prev => ({ ...prev, [pitstopId]: data }));
      setLoadingPitstop(null);
    }
  };

  const colors = PHASE_COLORS[drill.tag];

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="fixed inset-0 bg-black/20" />
      <div
        className="relative z-50 w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100">
          <div className="flex items-center gap-3 mb-3">
            <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${colors.pill}`}>{drill.tag}</span>
            <span className="text-xs text-stone-400">{filtered.length} pitstop{filtered.length !== 1 ? "s" : ""}</span>
            <button onClick={onClose} className="ml-auto p-1 text-stone-400 hover:text-stone-700 transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {/* Filters */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={filterGoalId}
              onChange={e => setFilterGoalId(e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2 py-1 bg-white text-stone-700 max-w-[160px] truncate"
            >
              <option value="">All goals</option>
              {goalDropdown.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
            </select>
            <select
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2 py-1 bg-white text-stone-700"
            >
              <option value="">All people</option>
              {ownerDropdown.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select
              value={filterDesig}
              onChange={e => setFilterDesig(e.target.value)}
              className="text-xs border border-stone-200 rounded-md px-2 py-1 bg-white text-stone-700"
            >
              <option value="">All roles</option>
              {availableDesigs.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Delay insight */}
        {topDelayers.length > 0 && (
          <div className="px-5 py-2.5 border-b border-stone-100 bg-red-50">
            <p className="text-[10px] font-semibold text-red-700 uppercase tracking-wide mb-1.5">Causing most delay</p>
            <div className="flex flex-wrap gap-2">
              {topDelayers.map(([id, info]) => (
                <div key={id} className="flex items-center gap-1.5">
                  <Avatar name={info.name} image={null} size="xs" />
                  <span className="text-xs text-red-700 font-medium">{info.name}</span>
                  {info.designation && <span className="text-[9px] text-red-500 bg-red-100 px-1 py-0.5 rounded">{info.designation}</span>}
                  <span className="text-[10px] text-red-600 font-semibold">{info.count} overdue</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SLA sections */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {DRILL_SECTIONS.map(({ key, label, headerCls, dotCls }) => {
            const rows = grouped[key];
            if (rows.length === 0) return null;
            return (
              <div key={key}>
                <div className={`flex items-center gap-2 px-2 py-1 rounded-md border mb-2 ${headerCls}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotCls}`} />
                  <span className="text-[11px] font-semibold">{label}</span>
                  <span className="text-[10px] ml-auto opacity-70">{rows.length}</span>
                </div>
                <div className="space-y-1.5">
                  {rows.map(r => (
                    <PitstopDrillCard
                      key={r.id}
                      row={r}
                      users={users}
                      expanded={expandedPitstop === r.id}
                      onToggle={() => togglePitstop(r.id)}
                      checklistItems={checklistMap[r.id]}
                      loadingChecklist={loadingPitstop === r.id}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-stone-400 text-center py-8">No pitstops match the current filters.</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-100">
          {filterGoalId ? (
            <Link href={`/goals/${filterGoalId}`} className="text-xs text-sky-600 hover:text-sky-800 font-medium">
              Open full goal →
            </Link>
          ) : (
            <span className="text-xs text-stone-400">{filtered.length} pitstop{filtered.length !== 1 ? "s" : ""} across {new Set(filtered.map(r => r.goalId)).size} goal{new Set(filtered.map(r => r.goalId)).size !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function PhaseMatrix({
  goals, phaseData, users,
}: {
  goals: Goal[];
  phaseData: PhaseRow[];
  users: UserRef[];
}) {
  const [drill, setDrill] = useState<DrillState>(null);
  const [viewMode, setViewMode] = useState<"by-goal" | "by-phase">("by-goal");
  const [filterGoalIds,    setFilterGoalIds]    = useState<string[]>([]);
  const [filterUserIds,    setFilterUserIds]    = useState<string[]>([]);
  const [filterZoneId,     setFilterZoneId]     = useState<string>("");
  const [filterClusterId,  setFilterClusterId]  = useState<string>("");

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const atRiskCutoff = new Date(today); atRiskCutoff.setDate(today.getDate() + 14);

  type CellData = {
    total: number; done: number;
    checklistTotal: number; checklistDone: number;
    activityTotal: number; activityDone: number;
    overdueCount: number; atRiskCount: number;
  };

  const tagMap = new Map<string, Map<PhaseTag, CellData>>();
  for (const row of phaseData) {
    const tag = row.progressTag as PhaseTag | null;
    if (!tag || !PHASE_TAGS.includes(tag as PhaseTag)) continue;
    if (!tagMap.has(row.goalId)) tagMap.set(row.goalId, new Map());
    const gMap = tagMap.get(row.goalId)!;
    const cur = gMap.get(tag) ?? { total: 0, done: 0, checklistTotal: 0, checklistDone: 0, activityTotal: 0, activityDone: 0, overdueCount: 0, atRiskCount: 0 };
    cur.total += 1;
    if (row.status === "Done") cur.done += 1;
    cur.checklistTotal += row.checklistTotal;
    cur.checklistDone  += row.checklistDone;
    cur.activityTotal  += row.activityTotal;
    cur.activityDone   += row.activityDone;
    if (row.status !== "Done" && row.targetDate) {
      const d = new Date(row.targetDate);
      if (d < today) cur.overdueCount++;
      else if (d <= atRiskCutoff) cur.atRiskCount++;
    }
    gMap.set(tag, cur);
  }

  const visibleGoals = goals.filter((g) => tagMap.has(g.id));

  // Derive zone/cluster options from visibleGoals (no extra API call)
  const zoneOptions = [...new Map(
    visibleGoals.flatMap(g => {
      const z = g.needsZone ?? g.needsCluster?.zone;
      return z ? [[z.id, { value: z.id, label: z.name }] as const] : [];
    })
  ).values()].sort((a, b) => a.label.localeCompare(b.label));

  const clusterOptions = visibleGoals
    .filter(g => !filterZoneId || g.needsCluster?.zone?.id === filterZoneId || g.needsZone?.id === filterZoneId)
    .filter(g => g.needsCluster)
    .map(g => ({ value: g.needsCluster!.id, label: g.needsCluster!.name }))
    .filter((v, i, a) => a.findIndex(x => x.value === v.value) === i)
    .sort((a, b) => a.label.localeCompare(b.label));

  const userOptions = [...new Map(
    visibleGoals.map(g => [g.owner.id, { value: g.owner.id, label: g.owner.name ?? "Unknown" }] as const)
  ).values()].sort((a, b) => a.label.localeCompare(b.label));

  const goalOptions = visibleGoals.map(g => ({ value: g.id, label: g.title }));

  const displayGoals = visibleGoals.filter(g => {
    if (filterGoalIds.length    && !filterGoalIds.includes(g.id))                                                       return false;
    if (filterUserIds.length    && !filterUserIds.includes(g.owner.id))                                                 return false;
    if (filterClusterId         && g.needsCluster?.id !== filterClusterId)                                              return false;
    if (filterZoneId && g.needsCluster?.zone?.id !== filterZoneId && g.needsZone?.id !== filterZoneId)                  return false;
    return true;
  });

  const hasFilters = filterGoalIds.length > 0 || filterUserIds.length > 0 || filterZoneId || filterClusterId;
  function clearFilters() {
    setFilterGoalIds([]); setFilterUserIds([]); setFilterZoneId(""); setFilterClusterId("");
  }

  if (visibleGoals.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-stone-200 rounded-xl">
        <GitBranch className="w-8 h-8 text-stone-200 mx-auto mb-2" />
        <p className="text-sm text-stone-400">No pitstops have phase tags yet. Tags are assigned automatically when goals are created from templates.</p>
      </div>
    );
  }

  function healthDot(cell: CellData) {
    if (cell.overdueCount > 0) return <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Has overdue pitstops" />;
    if (cell.atRiskCount > 0)  return <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Has at-risk pitstops" />;
    if (cell.done === cell.total) return <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="All done" />;
    return <span className="w-2 h-2 rounded-full bg-sky-400 flex-shrink-0" title="On track" />;
  }

  return (
    <>
      {drill && (
        <DrillDownPanel
          drill={drill}
          phaseData={phaseData}
          goals={goals}
          users={users}
          onClose={() => setDrill(null)}
        />
      )}
      <div className="space-y-3">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-stone-100">
          <MultiSelect
            options={goalOptions}
            value={filterGoalIds}
            onChange={setFilterGoalIds}
            placeholder="Filter goals…"
            className="min-w-[160px]"
          />
          <MultiSelect
            options={userOptions}
            value={filterUserIds}
            onChange={setFilterUserIds}
            placeholder="Filter users…"
            className="min-w-[140px]"
          />
          <select
            value={filterZoneId}
            onChange={e => { setFilterZoneId(e.target.value); setFilterClusterId(""); }}
            className="text-xs border border-stone-200 rounded-md px-2 py-1.5 text-stone-700 bg-white min-w-[130px]"
          >
            <option value="">All zones</option>
            {zoneOptions.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
          </select>
          <select
            value={filterClusterId}
            onChange={e => setFilterClusterId(e.target.value)}
            className="text-xs border border-stone-200 rounded-md px-2 py-1.5 text-stone-700 bg-white min-w-[130px]"
            disabled={clusterOptions.length === 0}
          >
            <option value="">All clusters</option>
            {clusterOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-stone-500 hover:text-stone-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-4 mb-4 flex-wrap">
          <p className="text-xs text-stone-500 flex-1">
            {displayGoals.length}{displayGoals.length !== visibleGoals.length ? ` of ${visibleGoals.length}` : ""} goals with phase-tagged pitstops.
          </p>
          {/* View mode toggle */}
          <div className="flex items-center rounded-lg border border-stone-200 overflow-hidden text-[10px] font-medium flex-shrink-0">
            <button
              onClick={() => setViewMode("by-goal")}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === "by-goal" ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-50"}`}
            >By goal</button>
            <button
              onClick={() => setViewMode("by-phase")}
              className={`px-2.5 py-1.5 transition-colors border-l border-stone-200 ${viewMode === "by-phase" ? "bg-stone-800 text-white" : "text-stone-500 hover:bg-stone-50"}`}
            >By phase</button>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-stone-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Overdue</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />At risk</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-sky-400 inline-block" />On track</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Done</span>
          </div>
        </div>
        {viewMode === "by-goal" ? (
          <>
            {/* Mobile: one card per goal */}
            <div className="sm:hidden -mx-4 px-4">
              <div className="overflow-x-auto snap-x snap-mandatory flex gap-3 pb-3">
                {displayGoals.map((goal) => {
                  const gMap = tagMap.get(goal.id) ?? new Map();
                  const activePhaseTags = PHASE_TAGS.filter(tag => gMap.has(tag));
                  return (
                    <div key={goal.id} className="snap-start min-w-[82vw] rounded-xl border border-stone-200 bg-white p-4 flex-shrink-0">
                      <Link href={`/goals/${goal.id}`} className="text-sm font-semibold text-stone-800 hover:text-sky-600 block mb-1 line-clamp-2 leading-snug">
                        {goal.title}
                      </Link>
                      <p className="text-[11px] text-stone-400 mb-3">{goal.owner.name ?? ""}</p>
                      <div className="space-y-2.5">
                        {activePhaseTags.map((tag) => {
                          const cell = gMap.get(tag)!;
                          const clPct  = cell.checklistTotal > 0 ? Math.round((cell.checklistDone / cell.checklistTotal) * 100) : null;
                          const actPct = cell.activityTotal  > 0 ? Math.round((cell.activityDone  / cell.activityTotal)  * 100) : null;
                          const isActive = drill?.tag === tag && drill.seedGoalId === goal.id;
                          return (
                            <div
                              key={tag}
                              className={`rounded-lg p-2 cursor-pointer transition-colors ${isActive ? "bg-stone-100 ring-1 ring-stone-300" : "bg-stone-50 active:bg-stone-100"}`}
                              onClick={() => setDrill(d => d?.tag === tag && d.seedGoalId === goal.id ? null : { tag, seedGoalId: goal.id })}
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0 ${PHASE_COLORS[tag].pill}`}>{tag}</span>
                                {healthDot(cell)}
                                <span className={`text-[10px] tabular-nums ml-auto ${cell.done === cell.total ? "text-emerald-600 font-medium" : "text-stone-500"}`}>
                                  {cell.done}/{cell.total}
                                </span>
                              </div>
                              {(clPct !== null || actPct !== null) && (
                                <div className="space-y-1">
                                  {clPct !== null && (
                                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${clPct}%` }} />
                                    </div>
                                  )}
                                  {actPct !== null && (
                                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                      <div className="h-full bg-violet-400 rounded-full" style={{ width: `${actPct}%` }} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop: goal × phase table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 font-medium text-stone-500 whitespace-nowrap min-w-[180px]">Goal</th>
                    {PHASE_TAGS.map((tag) => (
                      <th key={tag} className="py-2 px-1 text-center font-medium whitespace-nowrap">
                        <button
                          className={`inline-block px-2 py-0.5 rounded border text-[10px] hover:opacity-80 transition-opacity cursor-pointer ${PHASE_COLORS[tag].pill} ${drill?.tag === tag && !drill.seedGoalId ? "ring-2 ring-offset-1 ring-stone-400" : ""}`}
                          onClick={() => setDrill(d => d?.tag === tag && !d.seedGoalId ? null : { tag })}
                          title={`Drill all goals in ${tag} phase`}
                        >
                          {tag}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayGoals.map((goal, i) => {
                    const gMap = tagMap.get(goal.id) ?? new Map();
                    return (
                      <tr key={goal.id} className={i % 2 === 0 ? "bg-white" : "bg-stone-50"}>
                        <td className="py-2 pr-4">
                          <Link href={`/goals/${goal.id}`} className="font-medium text-stone-800 hover:text-sky-600 truncate block max-w-[200px]">
                            {goal.title}
                          </Link>
                        </td>
                        {PHASE_TAGS.map((tag) => {
                          const cell = gMap.get(tag);
                          if (!cell) return <td key={tag} className="py-2 px-1 text-center text-stone-200">—</td>;
                          const clPct  = cell.checklistTotal > 0 ? Math.round((cell.checklistDone / cell.checklistTotal) * 100) : null;
                          const actPct = cell.activityTotal  > 0 ? Math.round((cell.activityDone  / cell.activityTotal)  * 100) : null;
                          const isActive = drill?.tag === tag && drill.seedGoalId === goal.id;
                          return (
                            <td key={tag} className="py-1.5 px-1">
                              <div
                                className={`flex flex-col gap-1 rounded-md p-1.5 cursor-pointer transition-colors min-w-[64px] ${isActive ? "bg-stone-100 ring-1 ring-stone-300" : "hover:bg-stone-50"}`}
                                onClick={() => setDrill(d => d?.tag === tag && d.seedGoalId === goal.id ? null : { tag, seedGoalId: goal.id })}
                                title="Click to drill down"
                              >
                                <div className="flex items-center gap-1.5 justify-between">
                                  {healthDot(cell)}
                                  <span className={`text-[10px] tabular-nums ml-auto ${cell.done === cell.total ? "text-emerald-600" : "text-stone-500"}`}>
                                    {cell.done}/{cell.total}
                                  </span>
                                </div>
                                {clPct !== null && (
                                  <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-400 rounded-full" style={{ width: `${clPct}%` }} />
                                  </div>
                                )}
                                {actPct !== null && (
                                  <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${actPct}%` }} />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            {/* Mobile: one card per phase, goals listed inside */}
            <div className="sm:hidden -mx-4 px-4">
              <div className="overflow-x-auto snap-x snap-mandatory flex gap-3 pb-3">
                {PHASE_TAGS.filter(tag => displayGoals.some(g => tagMap.get(g.id)?.has(tag))).map((tag) => {
                  const goalsInPhase = displayGoals.filter(g => tagMap.get(g.id)?.has(tag));
                  return (
                    <div key={tag} className="snap-start min-w-[82vw] rounded-xl border border-stone-200 bg-white p-4 flex-shrink-0">
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${PHASE_COLORS[tag].pill}`}>{tag}</span>
                        <span className="text-[11px] text-stone-400">{goalsInPhase.length} goal{goalsInPhase.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="space-y-3">
                        {goalsInPhase.map((goal) => {
                          const cell = tagMap.get(goal.id)!.get(tag)!;
                          const clPct  = cell.checklistTotal > 0 ? Math.round((cell.checklistDone / cell.checklistTotal) * 100) : null;
                          const actPct = cell.activityTotal  > 0 ? Math.round((cell.activityDone  / cell.activityTotal)  * 100) : null;
                          const isActive = drill?.tag === tag && drill.seedGoalId === goal.id;
                          return (
                            <div
                              key={goal.id}
                              className={`rounded-lg p-2.5 cursor-pointer transition-colors ${isActive ? "bg-stone-100 ring-1 ring-stone-300" : "bg-stone-50 active:bg-stone-100"}`}
                              onClick={() => setDrill(d => d?.tag === tag && d.seedGoalId === goal.id ? null : { tag, seedGoalId: goal.id })}
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                {healthDot(cell)}
                                <span className={`text-[10px] tabular-nums ml-auto flex-shrink-0 ${cell.done === cell.total ? "text-emerald-600 font-medium" : "text-stone-500"}`}>
                                  {cell.done}/{cell.total}
                                </span>
                              </div>
                              <p className="text-xs font-medium text-stone-800 line-clamp-2 mb-0.5">{goal.title}</p>
                              <p className="text-[10px] text-stone-400">{goal.owner.name ?? ""}</p>
                              {(clPct !== null || actPct !== null) && (
                                <div className="space-y-1 mt-2">
                                  {clPct !== null && (
                                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${clPct}%` }} />
                                    </div>
                                  )}
                                  {actPct !== null && (
                                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                                      <div className="h-full bg-violet-400 rounded-full" style={{ width: `${actPct}%` }} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Desktop: phase sections, goals listed under each */}
            <div className="hidden sm:block space-y-4">
              {PHASE_TAGS.filter(tag => displayGoals.some(g => tagMap.get(g.id)?.has(tag))).map((tag) => {
                const goalsInPhase = displayGoals.filter(g => tagMap.get(g.id)?.has(tag));
                const isTagActive = drill?.tag === tag && !drill.seedGoalId;
                return (
                  <div key={tag}>
                    <div className="flex items-center gap-3 mb-2">
                      <button
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium hover:opacity-80 transition-opacity cursor-pointer ${PHASE_COLORS[tag].pill} ${isTagActive ? "ring-2 ring-offset-1 ring-stone-400" : ""}`}
                        onClick={() => setDrill(d => d?.tag === tag && !d.seedGoalId ? null : { tag })}
                        title={`Drill all goals in ${tag} phase`}
                      >
                        {tag}
                      </button>
                      <span className="text-xs text-stone-400">{goalsInPhase.length} goal{goalsInPhase.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="border border-stone-100 rounded-xl overflow-hidden">
                      {goalsInPhase.map((goal, i) => {
                        const cell = tagMap.get(goal.id)!.get(tag)!;
                        const clPct  = cell.checklistTotal > 0 ? Math.round((cell.checklistDone / cell.checklistTotal) * 100) : null;
                        const actPct = cell.activityTotal  > 0 ? Math.round((cell.activityDone  / cell.activityTotal)  * 100) : null;
                        const isActive = drill?.tag === tag && drill.seedGoalId === goal.id;
                        return (
                          <div
                            key={goal.id}
                            className={`flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${i % 2 === 0 ? "bg-white" : "bg-stone-50"} ${isActive ? "ring-inset ring-1 ring-stone-300 bg-stone-100" : "hover:bg-stone-50"}`}
                            onClick={() => setDrill(d => d?.tag === tag && d.seedGoalId === goal.id ? null : { tag, seedGoalId: goal.id })}
                          >
                            {healthDot(cell)}
                            <div className="flex-1 min-w-0">
                              <Link
                                href={`/goals/${goal.id}`}
                                className="text-xs font-medium text-stone-800 hover:text-sky-600 truncate block"
                                onClick={e => e.stopPropagation()}
                              >
                                {goal.title}
                              </Link>
                              <p className="text-[10px] text-stone-400 truncate">{goal.owner.name ?? ""}</p>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className={`text-[10px] tabular-nums ${cell.done === cell.total ? "text-emerald-600 font-medium" : "text-stone-500"}`}>
                                {cell.done}/{cell.total}
                              </span>
                              <div className="w-20 space-y-0.5">
                                {clPct !== null && (
                                  <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-sky-400 rounded-full" style={{ width: `${clPct}%` }} />
                                  </div>
                                )}
                                {actPct !== null && (
                                  <div className="w-full h-1 bg-stone-200 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${actPct}%` }} />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <div className="flex items-center gap-4 pt-1 text-[10px] text-stone-400">
          <span className="flex items-center gap-1"><span className="inline-block w-8 h-1 bg-sky-400 rounded-full" />Checklist</span>
          <span className="flex items-center gap-1"><span className="inline-block w-8 h-1 bg-violet-400 rounded-full" />Activities</span>
        </div>
      </div>
    </>
  );
}
