"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, ChevronDown, ChevronRight, AlertTriangle, Plus, X } from "lucide-react";
import Avatar from "@/components/Avatar";

type User = { id: string; name: string | null; image: string | null };
type PitstopRef = { id: string; title: string; goal: { id: string; title: string } };
type StandupLog = {
  id: string;
  date: string;
  yesterday: string | null;
  today: string | null;
  blockers: string | null;
  user: User;
  pitstops: { pitstop: PitstopRef }[];
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function LogCard({ log }: { log: StandupLog }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 space-y-2.5">
      <div className="flex items-center gap-2">
        <Avatar name={log.user.name} image={log.user.image} size="sm" />
        <span className="text-sm font-medium text-stone-800">{log.user.name ?? "—"}</span>
        <span className="ml-auto text-[10px] text-stone-400">{fmtDate(log.date)}</span>
      </div>
      {log.yesterday && (
        <div>
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-0.5">Yesterday</p>
          <p className="text-xs text-stone-700 whitespace-pre-wrap">{log.yesterday}</p>
        </div>
      )}
      {log.today && (
        <div>
          <p className="text-[10px] font-semibold text-sky-500 uppercase tracking-wide mb-0.5">Today</p>
          <p className="text-xs text-stone-700 whitespace-pre-wrap">{log.today}</p>
        </div>
      )}
      {log.blockers && (
        <div>
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide mb-0.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Blockers
          </p>
          <p className="text-xs text-stone-700 whitespace-pre-wrap">{log.blockers}</p>
        </div>
      )}
      {log.pitstops.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {log.pitstops.map(({ pitstop }) => (
            <Link
              key={pitstop.id}
              href={`/goals/${pitstop.goal.id}/pitstops/${pitstop.id}`}
              className="text-[10px] bg-stone-50 border border-stone-200 text-stone-600 px-2 py-0.5 rounded-full hover:bg-stone-100 transition-colors"
            >
              {pitstop.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StandupView({
  initialLogs,
  inProgressPitstops,
  users,
  currentUserId,
}: {
  initialLogs: StandupLog[];
  inProgressPitstops: PitstopRef[];
  users: User[];
  currentUserId: string;
}) {
  const [logs, setLogs] = useState(initialLogs);
  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [yesterday, setYesterday] = useState("");
  const [today, setToday] = useState("");
  const [blockers, setBlockers] = useState("");
  const [selectedPitstops, setSelectedPitstops] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const filteredLogs = filterUserId === "all"
    ? logs
    : logs.filter((l) => l.user.id === filterUserId);

  // Group by date
  const byDate = filteredLogs.reduce<Record<string, StandupLog[]>>((acc, log) => {
    const key = new Date(log.date).toDateString();
    (acc[key] = acc[key] ?? []).push(log);
    return acc;
  }, {});

  const togglePitstop = (id: string) =>
    setSelectedPitstops((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);

  const handleSubmit = async () => {
    if (!yesterday.trim() && !today.trim() && !blockers.trim()) return;
    setSaving(true);
    const res = await fetch("/api/standup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        yesterday: yesterday.trim() || null,
        today: today.trim() || null,
        blockers: blockers.trim() || null,
        pitstopIds: selectedPitstops,
      }),
    });
    if (res.ok) {
      const log = await res.json();
      setLogs((prev) => [log, ...prev]);
      setYesterday(""); setToday(""); setBlockers(""); setSelectedPitstops([]);
      setShowForm(false);
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-stone-400" /> Standup Log
          </h1>
          <p className="text-sm text-stone-400 mt-0.5">Daily updates from the team — last 7 days</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Log update
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="mb-6 bg-white rounded-xl border border-stone-200 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-stone-700">Your standup for today</p>
            <button onClick={() => setShowForm(false)} className="p-1 text-stone-400 hover:text-stone-600">
              <X className="w-4 h-4" />
            </button>
          </div>

          {[
            { label: "Yesterday", placeholder: "What did you work on?", value: yesterday, set: setYesterday, color: "stone" },
            { label: "Today",     placeholder: "What are you working on today?", value: today, set: setToday, color: "sky" },
            { label: "Blockers",  placeholder: "Anything blocking you? (optional)", value: blockers, set: setBlockers, color: "red" },
          ].map(({ label, placeholder, value, set }) => (
            <div key={label}>
              <label className="block text-xs font-medium text-stone-500 mb-1">{label}</label>
              <textarea
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={placeholder}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
              />
            </div>
          ))}

          {inProgressPitstops.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-2">Pitstops you worked on</label>
              <div className="flex flex-wrap gap-1.5">
                {inProgressPitstops.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePitstop(p.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selectedPitstops.includes(p.id)
                        ? "bg-sky-50 border-sky-300 text-sky-700"
                        : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"
                    }`}
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSubmit}
              disabled={saving || (!yesterday.trim() && !today.trim() && !blockers.trim())}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saving ? "Saving…" : "Submit"}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter by user */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterUserId("all")}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            filterUserId === "all" ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
          }`}
        >
          Everyone
        </button>
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => setFilterUserId(u.id)}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors ${
              filterUserId === u.id ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-500 border-stone-200 hover:bg-stone-50"
            }`}
          >
            <Avatar name={u.name} image={u.image} size="xs" />
            {u.name ?? u.id}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {Object.keys(byDate).length === 0 ? (
        <div className="text-center py-16">
          <Users className="w-8 h-8 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-400 text-sm">No standup logs yet this week.</p>
          <button onClick={() => setShowForm(true)} className="mt-3 text-sky-500 text-sm hover:text-sky-700">
            Log your first update
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byDate).map(([dateKey, dayLogs]) => (
            <div key={dateKey}>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">
                {new Date(dateKey).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <div className="space-y-3">
                {dayLogs.map((log) => <LogCard key={log.id} log={log} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
