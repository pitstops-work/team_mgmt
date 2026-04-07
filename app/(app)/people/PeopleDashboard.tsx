"use client";

import Link from "next/link";
import Avatar from "@/components/Avatar";
import { PitstopStatusBadge, GoalStatusBadge } from "@/components/StatusBadge";
import { AlertCircle, CheckCircle2, Clock, Circle } from "lucide-react";

type Goal = { id: string; title: string; status: string; targetDate: string | null };
type Pitstop = {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  startDate: string | null;
  completedAt: string | null;
  goalId: string;
  goal: { id: string; title: string; status: string };
};
type User = {
  id: string;
  name: string | null;
  image: string | null;
  ownedPitstops: Pitstop[];
};

function isOverdue(p: Pitstop) {
  return p.status !== "Done" && p.targetDate && new Date(p.targetDate) < new Date();
}

function statusIcon(p: Pitstop) {
  if (isOverdue(p)) return <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />;
  if (p.status === "Done") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />;
  if (p.status === "InProgress") return <Clock className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />;
  return <Circle className="w-3.5 h-3.5 text-stone-300 flex-shrink-0" />;
}

export default function PeopleDashboard({ users, goals }: { users: User[]; goals: Goal[] }) {
  const now = new Date();

  // Only show users who have at least one pitstop
  const activeUsers = users.filter((u) => u.ownedPitstops.length > 0);
  const unassigned = users.filter((u) => u.ownedPitstops.length === 0);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-lg font-semibold text-stone-900 mb-1">People</h1>
      <p className="text-sm text-stone-500 mb-6">Pitstop ownership and status by person</p>

      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <SummaryCard
          label="Total pitstops"
          value={users.reduce((s, u) => s + u.ownedPitstops.length, 0)}
          color="stone"
        />
        <SummaryCard
          label="In progress"
          value={users.reduce((s, u) => s + u.ownedPitstops.filter((p) => p.status === "InProgress").length, 0)}
          color="sky"
        />
        <SummaryCard
          label="Overdue"
          value={users.reduce((s, u) => s + u.ownedPitstops.filter(isOverdue).length, 0)}
          color="red"
        />
        <SummaryCard
          label="Done"
          value={users.reduce((s, u) => s + u.ownedPitstops.filter((p) => p.status === "Done").length, 0)}
          color="emerald"
        />
      </div>

      {/* Per-person cards */}
      <div className="space-y-4">
        {activeUsers.map((user) => {
          const overdue = user.ownedPitstops.filter(isOverdue);
          const inProgress = user.ownedPitstops.filter((p) => p.status === "InProgress" && !isOverdue(p));
          const upcoming = user.ownedPitstops.filter((p) => p.status === "Upcoming");
          const done = user.ownedPitstops.filter((p) => p.status === "Done");

          // Group pitstops by goal
          const byGoal = new Map<string, { goal: Pitstop["goal"]; pitstops: Pitstop[] }>();
          for (const p of user.ownedPitstops) {
            if (!byGoal.has(p.goalId)) byGoal.set(p.goalId, { goal: p.goal, pitstops: [] });
            byGoal.get(p.goalId)!.pitstops.push(p);
          }

          return (
            <div key={user.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-100 bg-stone-50">
                <Avatar name={user.name} image={user.image} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800">{user.name ?? "Unknown"}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-stone-500">
                  {overdue.length > 0 && (
                    <span className="flex items-center gap-1 text-red-600 font-medium">
                      <AlertCircle className="w-3 h-3" />
                      {overdue.length} overdue
                    </span>
                  )}
                  <span>{inProgress.length} in progress</span>
                  <span>{upcoming.length} upcoming</span>
                  <span className="text-emerald-600">{done.length} done</span>
                  <WorkloadBar active={inProgress.length + upcoming.length} />
                </div>
              </div>

              {/* Pitstops grouped by goal */}
              <div className="divide-y divide-stone-100">
                {Array.from(byGoal.values()).map(({ goal, pitstops }) => (
                  <div key={goal.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Link
                        href={`/goals/${goal.id}`}
                        className="text-xs font-medium text-stone-500 hover:text-sky-600 truncate"
                      >
                        {goal.title}
                      </Link>
                      <GoalStatusBadge status={goal.status as any} />
                    </div>
                    <div className="space-y-1">
                      {pitstops
                        .sort((a, b) => {
                          const order = ["InProgress", "Upcoming", "Done"];
                          return order.indexOf(a.status) - order.indexOf(b.status);
                        })
                        .map((p) => (
                          <Link
                            key={p.id}
                            href={`/goals/${p.goalId}/pitstops/${p.id}`}
                            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-stone-50 group"
                          >
                            {statusIcon(p)}
                            <span className={`text-sm flex-1 truncate ${isOverdue(p) ? "text-red-700" : "text-stone-700"}`}>
                              {p.title}
                            </span>
                            <div className="flex items-center gap-2">
                              <PitstopStatusBadge status={p.status as any} />
                              {p.targetDate && (
                                <span className={`text-xs ${isOverdue(p) ? "text-red-500 font-medium" : "text-stone-400"}`}>
                                  {isOverdue(p) ? "due " : ""}
                                  {new Date(p.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                            </div>
                          </Link>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {activeUsers.length === 0 && (
          <div className="text-center py-16 text-stone-400 text-sm">
            No pitstops assigned yet.
          </div>
        )}
      </div>
    </div>
  );
}

function WorkloadBar({ active }: { active: number }) {
  // 1-2: light, 3-5: medium, 6+: heavy
  const level = active === 0 ? "none" : active <= 2 ? "light" : active <= 5 ? "medium" : "heavy";
  const colors = { none: "bg-stone-100", light: "bg-emerald-400", medium: "bg-amber-400", heavy: "bg-red-400" };
  const labels = { none: "Free", light: "Light", medium: "Busy", heavy: "Overloaded" };
  const widths = { none: "w-1/4", light: "w-1/3", medium: "w-2/3", heavy: "w-full" };
  return (
    <div className="flex items-center gap-1.5" title={`${active} active pitstop${active !== 1 ? "s" : ""}`}>
      <div className="w-12 h-1.5 bg-stone-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colors[level]} ${widths[level]}`} />
      </div>
      <span className={`text-[10px] font-medium ${level === "heavy" ? "text-red-500" : level === "medium" ? "text-amber-500" : "text-stone-400"}`}>
        {labels[level]}
      </span>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    stone: "bg-stone-50 border-stone-200 text-stone-700",
    sky: "bg-sky-50 border-sky-200 text-sky-700",
    red: "bg-red-50 border-red-200 text-red-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
