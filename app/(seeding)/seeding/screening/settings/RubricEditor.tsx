"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ProfileChart from "../_components/ProfileChart";
import { removeGeoRubric, saveRubric } from "../actions";
import type { Dimension } from "@/lib/seeding/screening/rubric";

const blank = (): Dimension => ({
  key: "",
  label: "",
  description: "",
  weight: 10,
  groupWeight: 10,
  groupOnly: false,
  anchors: { "1": "", "3": "", "5": "" },
});

export default function RubricEditor({
  rubricKey,
  label,
  initial,
  guidance: initialGuidance,
  version,
  inherited,
}: {
  rubricKey: string;
  label: string;
  initial: Dimension[];
  guidance: string;
  version: number | null;
  inherited: boolean;
}) {
  const router = useRouter();
  const [dims, setDims] = useState<Dimension[]>(initial);
  const [guidance, setGuidance] = useState(initialGuidance);
  const [editing, setEditing] = useState(!inherited);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const set = (i: number, patch: Partial<Dimension>) => setDims((ds) => ds.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const move = (i: number, by: number) =>
    setDims((ds) => {
      const j = i + by;
      if (j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const indiv = dims.filter((d) => !d.groupOnly);
  const sumW = indiv.reduce((n, d) => n + (Number(d.weight) || 0), 0);
  const sumG = dims.reduce((n, d) => n + (Number(d.groupWeight) || 0), 0);

  function save() {
    setMsg(null);
    start(async () => {
      try {
        await saveRubric(rubricKey, dims, guidance);
        setMsg({ ok: true, text: "Saved. New reviews use this rubric." });
        router.refresh();
      } catch (e) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
      }
    });
  }

  if (!editing) {
    return (
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 text-sm text-stone-600">
        <p>{label} uses the default rubric.</p>
        <button onClick={() => setEditing(true)} className="mt-2 rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700">
          Give {label} its own rubric
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3 min-w-0">
        {dims.map((d, i) => (
          <div key={i} className="rounded-xl border border-stone-200 bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={d.label}
                onChange={(e) => set(i, { label: e.target.value })}
                placeholder="Dimension name"
                className="flex-1 min-w-[12rem] rounded border border-stone-300 px-2 py-1.5 text-sm font-medium"
              />
              <label className="text-[11px] text-stone-500 flex items-center gap-1">
                Weight
                <input
                  type="number"
                  min={0}
                  value={d.groupOnly ? 0 : d.weight}
                  disabled={d.groupOnly}
                  onChange={(e) => set(i, { weight: Number(e.target.value) })}
                  className="w-16 rounded border border-stone-300 px-1.5 py-1 text-sm tabular-nums disabled:bg-stone-100"
                />
              </label>
              <label className="text-[11px] text-stone-500 flex items-center gap-1">
                Group weight
                <input
                  type="number"
                  min={0}
                  value={d.groupWeight}
                  onChange={(e) => set(i, { groupWeight: Number(e.target.value) })}
                  className="w-16 rounded border border-stone-300 px-1.5 py-1 text-sm tabular-nums"
                />
              </label>
              <label className="text-[11px] text-stone-500 flex items-center gap-1">
                <input type="checkbox" checked={d.groupOnly} onChange={(e) => set(i, { groupOnly: e.target.checked })} />
                Groups only
              </label>
              <div className="flex gap-1 ml-auto">
                <button onClick={() => move(i, -1)} className="px-1.5 text-stone-400 hover:text-stone-700" aria-label="Move up">
                  ↑
                </button>
                <button onClick={() => move(i, 1)} className="px-1.5 text-stone-400 hover:text-stone-700" aria-label="Move down">
                  ↓
                </button>
                <button
                  onClick={() => setDims((ds) => ds.filter((_, k) => k !== i))}
                  className="px-1.5 text-xs text-rose-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
            <textarea
              value={d.description}
              onChange={(e) => set(i, { description: e.target.value })}
              rows={2}
              placeholder="What this dimension assesses"
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              {(["1", "3", "5"] as const).map((k) => (
                <label key={k} className="text-[11px] text-stone-500">
                  A score of {k} looks like
                  <textarea
                    value={d.anchors[k]}
                    onChange={(e) => set(i, { anchors: { ...d.anchors, [k]: e.target.value } })}
                    rows={3}
                    className="mt-0.5 w-full rounded border border-stone-300 px-2 py-1.5 text-xs text-stone-800"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => setDims((ds) => [...ds, blank()])} className="text-sm text-sky-700 hover:underline">
          + Add a dimension
        </button>

        <label className="block">
          <span className="text-sm font-medium text-stone-700">
            {rubricKey === "default" ? "Guidance for every geography" : `About ${label}`}
          </span>
          <span className="block text-[11px] text-stone-500">
            Local context the first read and reviewers should keep in mind: languages, communities, known local organisations,
            things to look out for.
          </span>
          <textarea
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
            rows={5}
            className="mt-1 w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div className="space-y-3 lg:sticky lg:top-4 self-start">
        <div className="rounded-xl border border-stone-200 bg-white p-3">
          <ProfileChart
            axes={indiv.filter((d) => d.weight > 0).map((d) => d.label || "—")}
            series={[{ label: "Preview", values: indiv.filter((d) => d.weight > 0).map(() => 5), color: "#a8a29e", dashed: true }]}
            size={200}
          />
          <p className={`text-xs mt-1 ${sumW === 100 ? "text-stone-500" : "text-amber-700"}`}>
            Individual weights add to {sumW}
            {sumW !== 100 ? " — totals are scaled to 100" : ""}
          </p>
          <p className={`text-xs ${sumG === 100 ? "text-stone-500" : "text-amber-700"}`}>
            Group weights add to {sumG}
            {sumG !== 100 ? " — totals are scaled to 100" : ""}
          </p>
          {version !== null && <p className="text-[11px] text-stone-400 mt-1">Version {version}</p>}
        </div>
        <button
          onClick={save}
          disabled={pending}
          className="w-full rounded bg-stone-900 px-3 py-2 text-sm text-white hover:bg-stone-700 disabled:bg-stone-300"
        >
          {pending ? "Saving…" : `Save ${label.toLowerCase() === "default" ? "the default" : label} rubric`}
        </button>
        {!inherited && rubricKey !== "default" && (
          <button
            onClick={() =>
              confirm(`Remove ${label}'s own rubric? It will use the default from now on.`) &&
              start(async () => {
                await removeGeoRubric(rubricKey);
                router.refresh();
              })
            }
            className="w-full text-xs text-rose-600 hover:underline"
          >
            Use the default rubric instead
          </button>
        )}
        {msg && (
          <p
            className={`rounded px-2 py-1 text-xs ${
              msg.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
