"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check, X } from "lucide-react";

export type PitstopPickerOption = {
  id: string;
  title: string;
  owner: { id: string; name: string | null };
  goal: { id: string; title: string };
};

export type UserPickerOption = { id: string; name: string | null };

export default function PitstopMultiPicker({
  pitstops,
  users,
  selected,
  onChange,
  required,
}: {
  pitstops: PitstopPickerOption[];
  users: UserPickerOption[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  required?: boolean;
}) {
  const [open, setOpen]           = useState(false);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [goalFilter, setGoalFilter]   = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const ownerPool = ownerFilter
    ? pitstops.filter(p => p.owner.id === ownerFilter)
    : pitstops;

  const goals = Array.from(
    new Map(ownerPool.map(p => [p.goal.id, p.goal])).values()
  ).sort((a, b) => a.title.localeCompare(b.title));

  const filtered = ownerPool.filter(p => !goalFilter || p.goal.id === goalFilter);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const selectedList = pitstops.filter(p => selected.has(p.id));

  const btnLabel =
    selected.size === 0 ? "— select pitstops —"
    : selected.size === 1 ? (selectedList[0]?.title ?? "1 pitstop")
    : `${selected.size} pitstops selected`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors text-left ${
          selected.size > 0
            ? "border-sky-300 bg-sky-50 text-sky-700"
            : required && selected.size === 0
              ? "border-amber-200 bg-white text-stone-400 hover:border-stone-300"
              : "border-stone-200 bg-white text-stone-400 hover:border-stone-300"
        }`}
      >
        <span className="truncate">{btnLabel}</span>
        <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0 ml-1" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-40 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
          {/* Filters */}
          <div className="p-2 border-b border-stone-100 space-y-1.5">
            <select
              value={ownerFilter}
              onChange={e => { setOwnerFilter(e.target.value); setGoalFilter(""); }}
              className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none"
            >
              <option value="">All team members</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
              ))}
            </select>
            <select
              value={goalFilter}
              onChange={e => setGoalFilter(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-stone-200 rounded-lg bg-white focus:outline-none"
            >
              <option value="">All goals</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>

          {/* List */}
          <div className="max-h-52 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-4">No pitstops match</p>
            ) : filtered.map(p => {
              const checked = selected.has(p.id);
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left hover:bg-stone-50 transition-colors">
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${checked ? "bg-sky-500 border-sky-500" : "border-stone-300"}`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-stone-700 block font-medium">{p.title}</span>
                    <span className="text-stone-400 truncate block">{p.goal.title} · {p.owner.name ?? "?"}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="border-t border-stone-100 p-1">
              <button type="button" onClick={() => onChange(new Set())}
                className="w-full text-xs text-stone-400 hover:text-stone-600 py-1.5 text-center">
                Clear all
              </button>
            </div>
          )}
        </div>
      )}

      {/* Selected tags */}
      {selectedList.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {selectedList.map(p => (
            <span key={p.id}
              className="flex items-center gap-1 text-[11px] bg-sky-50 text-sky-700 border border-sky-200 rounded-full px-2 py-0.5">
              {p.title}
              <span className="text-stone-400 text-[10px]">· {p.goal.title}</span>
              <button type="button" onClick={() => toggle(p.id)} className="opacity-60 hover:opacity-100 ml-0.5">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
