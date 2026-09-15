"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  createSeedingSubGeo, updateSeedingSubGeo, archiveSeedingSubGeo,
  restoreSeedingSubGeo, reorderSeedingSubGeo,
} from "../../outreach/actions";

type SubGeo = {
  id: string; label: string; notes: string | null; archived: boolean;
  channelCount: number; sessionCount: number;
};
type Geo = { id: string; label: string; subGeos: SubGeo[] };

export default function SubGeosClient({ geos }: { geos: Geo[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [showArchived, setShowArchived] = useState(false);

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      try { setErr(null); await fn(); after?.(); }
      catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Sub-geographies</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            The level below a geography — NE states, Bangalore clusters, Odisha districts. Channels, sessions and
            leads can be tagged to one, so outreach can be read at the level the team actually works at.
          </p>
        </div>
        <label className="text-[11px] text-stone-500 flex items-center gap-1.5">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
          Show archived
        </label>
      </div>

      {err && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{err}</div>}

      {geos.map((g) => {
        const visible = g.subGeos.filter((s) => showArchived || !s.archived);
        return (
          <div key={g.id} className="rounded-xl border border-stone-200 bg-white overflow-hidden">
            <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700 flex items-baseline justify-between">
              <span>{g.label}</span>
              <span className="text-[11px] font-normal text-stone-400">{visible.filter((s) => !s.archived).length} active</span>
            </div>
            <div className="divide-y divide-stone-100">
              {visible.length === 0 && (
                <div className="px-4 py-5 text-sm text-stone-400 text-center">No sub-geographies yet.</div>
              )}
              {visible.map((s, i) => (
                <div key={s.id} className={`px-4 py-2 flex items-center gap-3 ${s.archived ? "opacity-50" : ""}`}>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button type="button" disabled={pending || i === 0 || s.archived} onClick={() => run(() => reorderSeedingSubGeo(s.id, "up"))}
                      className="text-[9px] leading-none text-stone-400 hover:text-stone-700 disabled:opacity-30">▲</button>
                    <button type="button" disabled={pending || i === visible.length - 1 || s.archived} onClick={() => run(() => reorderSeedingSubGeo(s.id, "down"))}
                      className="text-[9px] leading-none text-stone-400 hover:text-stone-700 disabled:opacity-30">▼</button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-stone-800 truncate">{s.label}</div>
                    <div className="text-[11px] text-stone-400">
                      {s.channelCount} channel{s.channelCount === 1 ? "" : "s"} · {s.sessionCount} session{s.sessionCount === 1 ? "" : "s"}
                      {s.notes ? ` · ${s.notes}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" disabled={pending} className="text-[11px] text-stone-500 hover:text-stone-800"
                      onClick={() => {
                        const next = prompt("Rename sub-geography", s.label);
                        if (next && next.trim() && next !== s.label) run(() => updateSeedingSubGeo(s.id, { label: next }));
                      }}>Rename</button>
                    {s.archived ? (
                      <button type="button" disabled={pending} className="text-[11px] text-sky-600 hover:underline"
                        onClick={() => run(() => restoreSeedingSubGeo(s.id))}>Restore</button>
                    ) : (
                      <button type="button" disabled={pending} className="text-[11px] text-rose-500 hover:text-rose-700"
                        onClick={() => {
                          const warn = s.channelCount + s.sessionCount > 0
                            ? `"${s.label}" is used by ${s.channelCount} channel(s) and ${s.sessionCount} session(s). Archiving keeps those tags — it just hides it from the pickers. Continue?`
                            : `Archive "${s.label}"?`;
                          if (confirm(warn)) run(() => archiveSeedingSubGeo(s.id));
                        }}>Archive</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-2.5 border-t border-stone-100 flex items-center gap-2">
              <input
                className="flex-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
                placeholder={`Add a sub-geography to ${g.label}…`}
                value={drafts[g.id] ?? ""}
                onChange={(e) => setDrafts((d) => ({ ...d, [g.id]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (drafts[g.id] ?? "").trim()) {
                    run(() => createSeedingSubGeo(g.id, drafts[g.id]), () => setDrafts((d) => ({ ...d, [g.id]: "" })));
                  }
                }}
              />
              <button type="button" disabled={pending || !(drafts[g.id] ?? "").trim()}
                onClick={() => run(() => createSeedingSubGeo(g.id, drafts[g.id]), () => setDrafts((d) => ({ ...d, [g.id]: "" })))}
                className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:bg-stone-300">Add</button>
            </div>
          </div>
        );
      })}

      <Link href="/seeding/outreach" className="text-xs text-sky-600 hover:underline inline-block">← Outreach</Link>
    </div>
  );
}
