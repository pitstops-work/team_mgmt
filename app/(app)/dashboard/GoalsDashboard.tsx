"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Target, ChevronRight, Layers, LayoutDashboard, ListChecks,
  MessageSquare, Home, Users, AlertTriangle, CheckCircle2, Flag,
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

type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: "Active" | "Paused" | "Complete";
  owner: { id: string; name: string | null; image: string | null };
  pitstops: { id: string; status: string }[];
  programs: { program: { id: string; title: string } }[];
  needsZone: { id: string; name: string; cityId: string | null } | null;
  needsCluster: { id: string; name: string; zoneId: string } | null;
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

interface Props {
  initialGoals: Goal[];
  currentUserId: string;
  searchResults: SearchResults | null;
  users: { id: string; name: string | null; image: string | null }[];
  programs: { id: string; title: string }[];
  threads: Thread[];
  myPitstops: MyPitstop[];
  overviewData: OverviewData;
  initialTab: "home" | "goals" | "team";
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
  if (thread.goalId && thread.goal) return `/goals/${thread.goal.id}#thread-${thread.id}`;
  if (thread.eventId) return `/activities`;
  if (thread.pitstop) return `/goals/${thread.pitstop.goal.id}/pitstops/${thread.pitstop.id}#thread-${thread.id}`;
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

export default function GoalsDashboard({
  initialGoals, currentUserId, searchResults, users, programs,
  threads, myPitstops, overviewData, initialTab, initialFilter = "All",
}: Props) {
  const [activeTab, setActiveTab] = useState<"home" | "goals" | "team">(initialTab);
  const [showCreate, setShowCreate] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);
  const [filter, setFilter] = useState<"All" | "Mine" | "Active" | "Paused" | "Complete">(initialFilter);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [geoFilter, setGeoFilter] = useState<GeoFilterValue>({ cityId: "", zoneId: "", clusterId: "" });

  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: goals = initialGoals } = useQuery<Goal[]>({
    queryKey: qk.goals(),
    queryFn: fetchGoals,
    initialData: initialGoals,
    initialDataUpdatedAt: Date.now(),
  });

  const filtered = goals.filter((g) => {
    if (filter === "Mine" && g.owner.id !== currentUserId) return false;
    if (filter === "Active" && g.status !== "Active") return false;
    if (filter === "Paused" && g.status !== "Paused") return false;
    if (filter === "Complete" && g.status !== "Complete") return false;
    if (selectedPrograms.length > 0 && !g.programs.some((pg) => selectedPrograms.includes(pg.program.id))) return false;
    if (selectedUsers.length > 0 && !selectedUsers.includes(g.owner.id)) return false;
    if (geoFilter.clusterId) return g.needsCluster?.id === geoFilter.clusterId;
    if (geoFilter.zoneId) return g.needsZone?.id === geoFilter.zoneId || g.needsCluster?.zoneId === geoFilter.zoneId;
    if (geoFilter.cityId) return g.needsZone?.cityId === geoFilter.cityId;
    return true;
  });

  const myGoals = filtered.filter((g) => g.owner.id === currentUserId);
  const teamGoals = filtered.filter((g) => g.owner.id !== currentUserId);

  const prefetchGoal = (goalId: string) => {
    queryClient.prefetchQuery({
      queryKey: qk.goal(goalId),
      queryFn: () => fetchGoal(goalId),
      staleTime: 30 * 1000,
    });
    router.prefetch(`/goals/${goalId}`);
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
              { key: "home",  label: "Home",  icon: <Home className="w-3.5 h-3.5" /> },
              { key: "goals", label: "Goals", icon: <ListChecks className="w-3.5 h-3.5" /> },
              { key: "team",  label: "Team",  icon: <Users className="w-3.5 h-3.5" /> },
            ] as const
          ).map(({ key, label, icon }) => (
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
              onClick={() => setShowTemplate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Layers className="w-4 h-4" />
              From Template
            </button>
            <button
              onClick={() => setShowCreate(true)}
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
                <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 bg-sky-500 text-white text-sm rounded-lg hover:bg-sky-600">
                  Create Goal
                </button>
              </div>
            ) : (
              <p className="text-center text-stone-400 text-sm py-16">No goals match your filters.</p>
            )
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

  return (
    <Link
      href={`/goals/${goal.id}`}
      onMouseEnter={() => onHover(goal.id)}
      onTouchStart={() => onHover(goal.id)}
      className="flex items-center gap-4 px-4 py-3.5 bg-white rounded-lg border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all group"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-medium text-stone-900 truncate">{goal.title}</p>
          <GoalStatusBadge status={goal.status} />
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
