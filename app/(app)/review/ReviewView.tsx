"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ClipboardCheck, Check, Clock, CalendarDays } from "lucide-react";
import Avatar from "@/components/Avatar";
import Link from "next/link";

type User = { id: string; name: string | null; image: string | null; email: string | null };

type PitstopRecord = {
  id: string;
  title: string;
  status: "Upcoming" | "InProgress" | "Done";
  targetDate: string | null;
  completedAt: string | null;
  goal: { id: string; title: string };
  owner: { id: string; name: string | null; image: string | null };
  ownerId: string | null;
};

type UserEntry = {
  user: { id: string; name: string | null; image: string | null };
  pitstops: PitstopRecord[];
};

type City = { id: string; name: string };

function fmtDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtPeriod(from: Date, to: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${from.toLocaleDateString("en-US", opts)} – ${to.toLocaleDateString("en-US", opts)}`;
}

function daysOverdue(targetDate: string | null): number {
  if (!targetDate) return 0;
  const diff = Date.now() - new Date(targetDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status, targetDate }: { status: PitstopRecord["status"]; targetDate: string | null }) {
  if (status === "Done") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
        <Check className="w-2.5 h-2.5" /> Done
      </span>
    );
  }
  if (status === "InProgress") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-100 text-sky-700">
        <Clock className="w-2.5 h-2.5" /> In Progress
      </span>
    );
  }
  // Upcoming
  const overdue = daysOverdue(targetDate);
  if (overdue > 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600">
        {overdue}d overdue
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-500">
      Upcoming
    </span>
  );
}

function PitstopRow({ pitstop }: { pitstop: PitstopRecord }) {
  const overdue = pitstop.status !== "Done" ? daysOverdue(pitstop.targetDate) : 0;

  let rowClass = "flex items-start gap-3 px-3 py-2.5 rounded-lg border ";
  if (pitstop.status === "Done") {
    rowClass += "bg-emerald-50 border-emerald-200";
  } else if (pitstop.status === "InProgress") {
    rowClass += "bg-sky-50 border-sky-200";
  } else if (overdue > 0) {
    rowClass += "bg-red-50 border-red-200";
  } else {
    rowClass += "bg-stone-50 border-stone-200";
  }

  return (
    <div className={rowClass}>
      <div className="flex-1 min-w-0">
        <Link
          href={`/goals/${pitstop.goal.id}/pitstops/${pitstop.id}`}
          className="text-sm text-stone-800 font-medium hover:text-sky-600 transition-colors leading-snug"
        >
          {pitstop.title}
        </Link>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <StatusBadge status={pitstop.status} targetDate={pitstop.targetDate} />
          {pitstop.targetDate && (
            <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
              <CalendarDays className="w-2.5 h-2.5" />
              Due {fmtDate(pitstop.targetDate)}
            </span>
          )}
          {pitstop.status === "Done" && pitstop.completedAt && (
            <span className="text-[10px] text-emerald-600">
              Completed {fmtDate(pitstop.completedAt)}
            </span>
          )}
          {pitstop.status !== "Done" && overdue > 0 && (
            <span className="text-[10px] text-red-500 font-medium">{overdue}d overdue</span>
          )}
        </div>
      </div>
    </div>
  );
}

function GoalGroup({ goalId, goalTitle, pitstops }: { goalId: string; goalTitle: string; pitstops: PitstopRecord[] }) {
  return (
    <div className="space-y-1.5">
      <Link
        href={`/goals/${goalId}`}
        className="block text-xs font-semibold text-stone-500 uppercase tracking-wide hover:text-sky-600 transition-colors"
      >
        {goalTitle}
      </Link>
      <div className="space-y-1.5 pl-0">
        {pitstops.map((p) => (
          <PitstopRow key={p.id} pitstop={p} />
        ))}
      </div>
    </div>
  );
}

function UserCard({ entry, isCurrentUser }: { entry: UserEntry; isCurrentUser: boolean }) {
  const pitstops = entry.pitstops;
  const allDone = pitstops.length > 0 && pitstops.every((p) => p.status === "Done");
  const hasOverdue = pitstops.some(
    (p) => p.status !== "Done" && daysOverdue(p.targetDate) > 0
  );

  // Group by goal
  const byGoal: Record<string, { goalId: string; goalTitle: string; pitstops: PitstopRecord[] }> = {};
  pitstops.forEach((p) => {
    const key = p.goal.id;
    if (!byGoal[key]) byGoal[key] = { goalId: p.goal.id, goalTitle: p.goal.title, pitstops: [] };
    byGoal[key].pitstops.push(p);
  });

  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
      {/* Card header */}
      <div
        className={`flex items-center gap-3 px-4 py-3 border-b border-stone-100 ${
          allDone ? "bg-emerald-50" : ""
        }`}
      >
        <Avatar name={entry.user.name} image={entry.user.image} size="sm" />
        <span className="text-sm font-semibold text-stone-800 flex-1">
          {entry.user.name ?? "—"}
          {isCurrentUser && (
            <span className="ml-2 text-[10px] font-medium text-sky-500 bg-sky-50 px-1.5 py-0.5 rounded-full">
              you
            </span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {allDone && (
            <span className="text-[10px] font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
              All done
            </span>
          )}
          {hasOverdue && (
            <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title="Has overdue items" />
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 space-y-4">
        {pitstops.length === 0 ? (
          <span className="inline-block text-[10px] text-stone-400 bg-stone-50 border border-stone-200 px-2.5 py-1 rounded-full">
            Nothing in this period
          </span>
        ) : (
          Object.values(byGoal).map((group) => (
            <GoalGroup
              key={group.goalId}
              goalId={group.goalId}
              goalTitle={group.goalTitle}
              pitstops={group.pitstops}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function ReviewView({
  users,
  currentUserId,
}: {
  users: User[];
  currentUserId: string;
}) {
  // Period state — default last 14 days
  const [periodEnd, setPeriodEnd] = useState<Date>(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });
  const [periodStart, setPeriodStart] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [data, setData] = useState<UserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [cities, setCities] = useState<City[]>([]);
  const [filterCity, setFilterCity] = useState<string>("all");

  const fetchData = useCallback(async (from: Date, to: Date) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/review-data?from=${from.toISOString()}&to=${to.toISOString()}`
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch cities on mount
  useEffect(() => {
    fetch("/api/geography")
      .then((r) => (r.ok ? r.json() : {}))
      .then((json: { cities?: { id: string; name: string }[] }) => {
        if (json && Array.isArray(json.cities)) setCities(json.cities);
      })
      .catch(() => {});
  }, []);

  // Fetch review data when period changes
  useEffect(() => {
    fetchData(periodStart, periodEnd);
  }, [periodStart, periodEnd, fetchData]);

  const shiftPeriod = (direction: -1 | 1) => {
    const shift = direction * 14 * 24 * 60 * 60 * 1000;
    setPeriodStart((prev) => new Date(prev.getTime() + shift));
    setPeriodEnd((prev) => new Date(prev.getTime() + shift));
  };

  // Build a map of userId -> UserEntry from fetched data
  const dataByUserId: Record<string, UserEntry> = {};
  data.forEach((entry) => {
    dataByUserId[entry.user.id] = entry;
  });

  // Merge all users with data (show all users, even those with no pitstops)
  const allEntries: Array<{ user: User; entry: UserEntry }> = users.map((u) => ({
    user: u,
    entry: dataByUserId[u.id] ?? {
      user: { id: u.id, name: u.name, image: u.image },
      pitstops: [],
    },
  }));

  // City filter is client-side — for now "All" shows everyone
  // (geography linkage can be wired later; filter button is present but noop for non-all)
  const visibleEntries =
    filterCity === "all" ? allEntries : allEntries; // placeholder: wire geography later

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-stone-400" /> Fortnightly Review
        </h1>
        <p className="text-sm text-stone-400 mt-0.5">
          Committed vs. delivered — honest shared visibility for the team
        </p>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => shiftPeriod(-1)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        <span className="text-sm font-medium text-stone-700 min-w-[140px] text-center">
          {fmtPeriod(periodStart, periodEnd)}
        </span>
        <button
          onClick={() => shiftPeriod(1)}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
        >
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* City filter bar */}
      {cities.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <button
            onClick={() => setFilterCity("all")}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filterCity === "all"
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
            }`}
          >
            All
          </button>
          {cities.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterCity(c.id)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filterCity === c.id
                  ? "bg-stone-900 text-white border-stone-900"
                  : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-stone-200 h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleEntries.map(({ user, entry }) => (
            <UserCard
              key={user.id}
              entry={entry}
              isCurrentUser={user.id === currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
