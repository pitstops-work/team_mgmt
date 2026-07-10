"use client";

import { useState, useTransition } from "react";
import { createSeedingWorkstream, updateSeedingWorkstream, archiveSeedingWorkstream } from "../actions";

type WS = { id: string; key: string; label: string; color: string; hasTasks: boolean };

export default function WorkstreamManager({ workstreams }: { workstreams: WS[] }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) => start(async () => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } });

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <button onClick={() => setOpen(!open)} className="text-sm font-medium text-stone-700">{open ? "▾" : "▸"} Manage workstreams</button>
      {open && (
        <div className="mt-3 space-y-3">
          {err && <div className="text-xs text-rose-600">{err}</div>}
          <div className="divide-y divide-stone-100">
            {workstreams.map((w) => (
              <div key={w.id} className="flex items-center gap-2 py-2">
                <input type="color" value={w.color} onChange={(e) => run(() => updateSeedingWorkstream(w.id, w.label, e.target.value))} className="w-6 h-6 rounded border-0 bg-transparent cursor-pointer" />
                <span className="text-xs text-stone-400 w-14 shrink-0">{w.key}</span>
                <input defaultValue={w.label} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== w.label) run(() => updateSeedingWorkstream(w.id, e.target.value)); }} className="flex-1 text-sm rounded border border-transparent hover:border-stone-200 focus:border-stone-300 px-2 py-1" />
                <button disabled={pending} onClick={() => { if (confirm(w.hasTasks ? "This workstream has tasks. Delete it and ALL its tasks?" : "Delete this workstream?")) run(() => archiveSeedingWorkstream(w.id)); }} className="text-[11px] text-rose-400 hover:text-rose-600 shrink-0">Delete</button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-stone-100">
            <label className="text-[11px] text-stone-500">Key<input value={key} onChange={(e) => setKey(e.target.value)} placeholder="F" className="mt-1 block w-16 rounded border border-stone-300 px-2 py-1.5 text-sm" /></label>
            <label className="text-[11px] text-stone-500 flex-1 min-w-[10rem]">Label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="F. New workstream" className="mt-1 block w-full rounded border border-stone-300 px-2 py-1.5 text-sm" /></label>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded border-0 bg-transparent cursor-pointer" />
            <button disabled={pending || !key.trim() || !label.trim()} onClick={() => run(async () => { await createSeedingWorkstream(key, label, color); setKey(""); setLabel(""); })} className="text-sm bg-sky-600 text-white px-3 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">Add workstream</button>
          </div>
        </div>
      )}
    </div>
  );
}
