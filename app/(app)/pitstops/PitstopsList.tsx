"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, X, Download, ListChecks } from "lucide-react";
import Avatar from "@/components/Avatar";
import { PitstopStatusBadge } from "@/components/StatusBadge";
import GeoFilter, { type GeoFilterValue } from "@/components/GeoFilter";
import MultiSelect from "@/components/MultiSelect";
import PitstopQuickSheet from "./PitstopQuickSheet";

type User = { id: string; name: string | null; image: string | null };
type Goal = { id: string; title: string; needsZoneId: string | null; needsClusterId: string | null };
type Pitstop = {
  id: string; title: string; type: string; status: string;
  startDate: string | null; targetDate: string | null;
  goal: Goal; owner: User | null;
  checklistItems: { id: string; checked: boolean }[];
};

const STATUS_ORDER = { InProgress: 0, Upcoming: 1, Done: 2 };

function downloadCsv(pitstops: Pitstop[]) {
  const rows = [
    ["Title", "Goal", "Status", "Owner", "Start Date", "Target Date", "Checklist Progress"],
    ...pitstops.map(p => [
      p.title,
      p.goal.title,
      p.status,
      p.owner?.name ?? "",
      p.startDate ?? "",
      p.targetDate ?? "",
      `${p.checklistItems.filter(c => c.checked).length}/${p.checklistItems.length}`,
    ])
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "pitstops.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function PitstopsList({ pitstops, goals, users, initialStatus = "", initialNoDate = false }: { pitstops: Pitstop[]; goals: Goal[]; users: User[]; initialStatus?: string; initialNoDate?: boolean }) {
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const [noDateOnly, setNoDateOnly] = useState(initialNoDate);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [quickSheetPitstop, setQuickSheetPitstop] = useState<Pitstop | null>(null);
  const [geoFilter, setGeoFilter] = useState<GeoFilterValue>({ cityId: "", zoneId: "", clusterId: "" });
  const [geoZones, setGeoZones] = useState<{ id: string; cityId: string | null }[]>([]);
  const [geoClusters, setGeoClusters] = useState<{ id: string; zoneId: string }[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/geo").then(r => r.json()).then(d => {
      setGeoZones(d.zones ?? []);
      setGeoClusters(d.clusters ?? []);
    }).catch(() => {});
  }, []);

  const filtered = pitstops
    .filter(p => selectedGoals.length === 0 || selectedGoals.includes(p.goal.id))
    .filter(p => selectedUsers.length === 0 || (p.owner !== null && selectedUsers.includes(p.owner.id)))
    .filter(p => !selectedStatus || p.status === selectedStatus)
    .filter(p => !noDateOnly || !p.targetDate)
    .filter(p => {
      if (geoFilter.clusterId) return p.goal.needsClusterId === geoFilter.clusterId;
      if (geoFilter.zoneId) {
        const clusterZoneId = geoClusters.find(c => c.id === p.goal.needsClusterId)?.zoneId;
        return p.goal.needsZoneId === geoFilter.zoneId || clusterZoneId === geoFilter.zoneId;
      }
      if (geoFilter.cityId) {
        const zoneMatch = p.goal.needsZoneId
          ? geoZones.find(z => z.id === p.goal.needsZoneId)?.cityId === geoFilter.cityId
          : false;
        if (zoneMatch) return true;
        const clusterZoneId = geoClusters.find(c => c.id === p.goal.needsClusterId)?.zoneId;
        return clusterZoneId
          ? geoZones.find(z => z.id === clusterZoneId)?.cityId === geoFilter.cityId
          : false;
      }
      return true;
    })
    .sort((a, b) => (STATUS_ORDER[a.status as keyof typeof STATUS_ORDER] ?? 3) - (STATUS_ORDER[b.status as keyof typeof STATUS_ORDER] ?? 3));

  const hasFilters = selectedGoals.length > 0 || selectedUsers.length > 0 || selectedStatus || noDateOnly || geoFilter.cityId || geoFilter.zoneId || geoFilter.clusterId;

  const allFilteredSelected = filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(p => p.id)));
    }
  };

  const handleBulkStatus = async (status: string) => {
    setBulkLoading(true);
    await fetch("/api/pitstops/bulk-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds), updates: { status } }),
    });
    setBulkLoading(false);
    setSelectedIds(new Set());
    router.refresh();
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">All Pitstops</h1>
          <p className="text-sm text-stone-500 mt-0.5">{filtered.length} of {pitstops.length} pitstops</p>
        </div>
        <button
          onClick={() => downloadCsv(filtered)}
          title="Export filtered pitstops as CSV"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 text-stone-600 rounded-lg hover:border-stone-300 hover:bg-stone-50 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 no-scrollbar">
        {/* Status */}
        {(["", "InProgress", "Upcoming", "Done"] as const).map(s => (
          <button key={s} onClick={() => { setSelectedStatus(s); setNoDateOnly(false); }}
            className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${selectedStatus === s && !noDateOnly ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
            {s === "" ? "All" : s === "InProgress" ? "In Progress" : s}
          </button>
        ))}
        <button onClick={() => { setSelectedStatus(""); setNoDateOnly(v => !v); }}
          className={`flex-shrink-0 px-3 py-1.5 text-xs rounded-full border transition-colors ${noDateOnly ? "bg-amber-600 text-white border-amber-600" : "border-stone-200 text-stone-600 hover:border-stone-300"}`}>
          No date
        </button>
        <div className="w-px h-4 bg-stone-200 flex-shrink-0" />
        {/* Goal picker */}
        <MultiSelect
          options={goals.map(g => ({ value: g.id, label: g.title }))}
          value={selectedGoals}
          onChange={setSelectedGoals}
          placeholder="All Goals"
        />
        {/* User picker */}
        <MultiSelect
          options={users.map(u => ({ value: u.id, label: u.name ?? u.id }))}
          value={selectedUsers}
          onChange={setSelectedUsers}
          placeholder="All People"
        />
        <div className="flex-shrink-0">
          <GeoFilter value={geoFilter} onChange={setGeoFilter} compact />
        </div>
        {hasFilters && (
          <button onClick={() => { setSelectedGoals([]); setSelectedUsers([]); setSelectedStatus(""); setNoDateOnly(false); setGeoFilter({ cityId: "", zoneId: "", clusterId: "" }); }}
            className="flex-shrink-0 flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-sky-50 border border-sky-200 rounded-lg">
          <span className="text-xs font-medium text-sky-700">{selectedIds.size} selected</span>
          <button
            onClick={() => handleBulkStatus("Done")}
            disabled={bulkLoading}
            className="px-2.5 py-1 text-xs bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            Mark Done
          </button>
          <button
            onClick={() => handleBulkStatus("InProgress")}
            disabled={bulkLoading}
            className="px-2.5 py-1 text-xs bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50 transition-colors"
          >
            Mark In Progress
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto p-1 text-sky-400 hover:text-sky-600 transition-colors"
            title="Clear selection"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <p className="text-center text-stone-400 text-sm py-16">No pitstops match your filters.</p>
      ) : (
        <div className="space-y-2">
          {/* Select-all header row */}
          {someSelected && (
            <div className="flex items-center gap-2 px-1 mb-1">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded border-stone-300 text-sky-500 focus:ring-sky-400 cursor-pointer"
              />
              <span className="text-xs text-stone-500">Select all ({filtered.length})</span>
            </div>
          )}
          {filtered.map(p => {
            const total = p.checklistItems.length;
            const done = p.checklistItems.filter(c => c.checked).length;
            const isSelected = selectedIds.has(p.id);
            return (
              <div key={p.id} className={`relative flex items-stretch bg-white border rounded-xl transition-all group ${isSelected ? "border-sky-300 shadow-sm" : "border-stone-200 hover:border-sky-200 hover:shadow-sm"}`}>
                {/* Checkbox */}
                <div className={`flex items-center pl-3 pr-1 ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"} transition-opacity`}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p.id)}
                    onClick={e => e.stopPropagation()}
                    className="w-3.5 h-3.5 rounded border-stone-300 text-sky-500 focus:ring-sky-400 cursor-pointer"
                  />
                </div>
                <Link href={`/goals/${p.goal.id}/pitstops/${p.id}`}
                  className="flex-1 px-3 py-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-stone-800 group-hover:text-sky-700 truncate">{p.title}</span>
                        <PitstopStatusBadge status={p.status as any} />
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5 truncate">{p.goal.title}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {p.owner && (
                          <div className="flex items-center gap-1">
                            <Avatar name={p.owner.name} image={p.owner.image} size="xs" />
                            <span className="text-xs text-stone-500">{p.owner.name}</span>
                          </div>
                        )}
                        {p.targetDate && (
                          <span className="text-xs text-stone-400">
                            Due {new Date(p.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        )}
                        {total > 0 && (
                          <span className="flex items-center gap-1 text-xs text-stone-400">
                            <CheckSquare className="w-3 h-3" />{done}/{total}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
                {total > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setQuickSheetPitstop(p); }}
                    title="Log work without leaving the list"
                    className="flex items-center justify-center px-3 border-l border-stone-100 text-stone-400 hover:text-sky-600 hover:bg-sky-50 transition-colors rounded-r-xl"
                  >
                    <ListChecks className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {quickSheetPitstop && (
        <PitstopQuickSheet
          pitstop={quickSheetPitstop}
          onClose={() => setQuickSheetPitstop(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  );
}
