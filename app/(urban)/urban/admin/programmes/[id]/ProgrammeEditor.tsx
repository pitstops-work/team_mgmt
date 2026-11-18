"use client";

// Settings editor: the JSON document on the left, validated as you type with
// the SAME rules the server applies (lib/urban/settings), and a preview of what
// a new effort would get on the right. Saving bumps the version and brings
// open efforts' open setup tasks in line (no resync button — rule R5).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseSettings, setupItemsFor, CHECK_LABEL, type StartMode } from "@/lib/urban/settings";
import { saveProgramme, setProgrammeActive } from "../../actions";

export function ProgrammeEditor({
  id, programmeKey, initialName, initialJson, version, active, openEfforts,
}: {
  id: string; programmeKey: string; initialName: string; initialJson: string; version: number; active: boolean; openEfforts: number;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [json, setJson] = useState(initialJson);
  const [mode, setMode] = useState<StartMode>("new");
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const parsed = useMemo(() => parseSettings(json), [json]);
  const dirty = name !== initialName || json !== initialJson;

  const save = () => start(async () => {
    const r = await saveProgramme(id, { name, settingsJson: json });
    if (!r.ok) return setNotice({ tone: "err", text: r.error });
    const s = r.data!;
    setNotice({ tone: "ok", text: `Saved as v${version + 1}. ${s.efforts} open effort${s.efforts === 1 ? "" : "s"}: ${s.updated} setup task${s.updated === 1 ? "" : "s"} updated, ${s.added} added, ${s.skipped} skipped. Done work is unchanged.` });
    router.refresh();
  });

  return (
    <div className="mt-1 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent text-xl font-semibold tracking-tight text-stone-900 outline-none" />
          <p className="text-xs text-stone-500">key <span className="font-mono">{programmeKey}</span> · v{version} · {openEfforts} open effort{openEfforts === 1 ? "" : "s"}{!active && " · inactive"}</p>
        </div>
        <button
          disabled={pending}
          onClick={() => start(async () => { const r = await setProgrammeActive(id, !active); if (!r.ok) setNotice({ tone: "err", text: r.error }); router.refresh(); })}
          className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-600 hover:bg-stone-50"
        >
          {active ? "Deactivate" : "Activate"}
        </button>
        <button disabled={pending || !dirty || !parsed.ok} onClick={save} className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-40">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {notice && <p className={`rounded-lg px-3 py-2 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{notice.text}</p>}
      {openEfforts > 0 && dirty && parsed.ok && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Saving changes the open setup tasks of {openEfforts} effort{openEfforts === 1 ? "" : "s"} to match. Done and skipped tasks stay as they are; items you removed close as skipped.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
            className={`h-[70vh] w-full rounded-xl border bg-white p-3 font-mono text-xs leading-relaxed outline-none ${parsed.ok ? "border-stone-200 focus:border-stone-400" : "border-red-300"}`}
          />
          {!parsed.ok && (
            <ul className="mt-2 space-y-0.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {parsed.errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
              {parsed.errors.length > 8 && <li>…and {parsed.errors.length - 8} more</li>}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          {parsed.ok ? (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-stone-500">Preview for an effort that is</span>
                {(["new", "already_running"] as const).map((m) => (
                  <button key={m} onClick={() => setMode(m)} className={`rounded-full px-2.5 py-1 font-medium ${mode === m ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-600"}`}>
                    {m === "new" ? "new" : "already running"}
                  </button>
                ))}
              </div>
              <Preview settings={parsed.settings} mode={mode} />
            </>
          ) : (
            <p className="text-sm text-stone-500">Fix the errors to see the preview.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Preview({ settings: s, mode }: { settings: NonNullable<Extract<ReturnType<typeof parseSettings>, { ok: true }>["settings"]>; mode: StartMode }) {
  const items = setupItemsFor(s, mode);
  const phases = new Map<string, typeof items>();
  for (const it of items) phases.set(it.phase, [...(phases.get(it.phase) ?? []), it]);
  const last = items.reduce((m, it) => Math.max(m, it.dueDay), 0);

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Setup · {items.length} items{items.length ? ` · ${last} days` : ""}</p>
        {items.length === 0 && <p className="mt-1 text-xs text-stone-500">None — goes straight to its routines.</p>}
        {[...phases.entries()].map(([ph, its]) => (
          <div key={ph} className="mt-2">
            <p className="text-xs font-medium text-stone-600">{ph}</p>
            <ul className="mt-0.5 space-y-0.5">
              {its.map((it) => (
                <li key={it.key} className="flex items-baseline gap-2 text-xs text-stone-700">
                  <span className="w-12 shrink-0 text-right tabular-nums text-stone-400">day {it.dueDay}</span>
                  <span className="min-w-0 flex-1">{it.title}{!it.required && <span className="text-stone-400"> (optional)</span>}</span>
                  <span className="shrink-0 text-[10px] text-stone-500">{CHECK_LABEL[it.check]}{it.list ? ` · ${s.lists[it.list]?.length ?? 0} pts` : ""}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Routines · {s.routines.length}</p>
        {s.routines.length === 0 && <p className="mt-1 text-xs text-stone-500">None — a time-boxed drive.</p>}
        {s.routines.map((r) => (
          <div key={r.key} className="mt-2">
            <p className="text-xs font-medium text-stone-700">{r.name} <span className="font-normal text-stone-400">· {r.cadence} · {r.mode}</span></p>
            <ul className="mt-0.5 space-y-0.5">
              {r.items.map((it) => (
                <li key={it.key} className="flex gap-2 text-xs text-stone-600">
                  <span className="min-w-0 flex-1">{it.title}{!it.required && <span className="text-stone-400"> (optional)</span>}</span>
                  <span className="shrink-0 text-[10px] text-stone-500">{CHECK_LABEL[it.check]}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-3 text-xs text-stone-600">
        <p className="font-semibold uppercase tracking-wider text-stone-400">Readings · {s.readings.length}</p>
        <p className="mt-1">{s.readings.map((r) => `${r.label}${r.per ? ` (per ${r.per})` : ""}${r.outcome ? " ★" : ""}`).join(" · ") || "None"}</p>
        {Object.keys(s.lists).length > 0 && <p className="mt-2"><span className="text-stone-400">Lists:</span> {Object.entries(s.lists).map(([k, v]) => `${k} (${v.length})`).join(" · ")}</p>}
        {Object.keys(s.dimensions).length > 0 && <p className="mt-1"><span className="text-stone-400">Dimensions:</span> {Object.entries(s.dimensions).map(([k, v]) => `${k}: ${v.length}`).join(" · ")}</p>}
        {s.need && <p className="mt-1"><span className="text-stone-400">Need:</span> {s.need.type === "count" ? `${s.need.population} ÷ ${s.need.per_unit}${s.need.existing ? ` − ${s.need.existing}` : ""}` : s.need.type === "saturation" ? `${s.need.received} ÷ ${s.need.eligible}, per ${s.need.per}` : "coverage"}</p>}
        <p className="mt-2 text-stone-400">★ counts as delivered</p>
      </div>
    </div>
  );
}
