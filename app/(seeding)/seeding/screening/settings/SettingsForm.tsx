"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "../actions";

type S = { advanceMin: number; holdMin: number; divergence: number; dailyCap: number; aiEnabled: boolean };

export default function SettingsForm({ initial }: { initial: S }) {
  const router = useRouter();
  const [v, setV] = useState<S>(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const num = (k: keyof S, label: string, hint: string) => (
    <label className="text-sm text-stone-700">
      {label}
      <input
        type="number"
        value={v[k] as number}
        onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
        className="mt-0.5 block w-24 rounded border border-stone-300 px-2 py-1.5 text-sm tabular-nums"
      />
      <span className="block text-[11px] text-stone-500">{hint}</span>
    </label>
  );
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-4 space-y-3">
      <div className="grid gap-4 sm:grid-cols-4">
        {num("advanceMin", "Advance from", "Totals at or above this are suggested for shortlisting.")}
        {num("holdMin", "Hold from", "Between this and the advance line: a second read.")}
        {num("divergence", "Divergence", "Two L2 totals further apart than this go to the lead.")}
        {num("dailyCap", "Daily limit", "Reviews per screener per day, shown as a reminder.")}
      </div>
      <label className="flex items-start gap-2 text-sm text-stone-700">
        <input type="checkbox" checked={v.aiEnabled} onChange={(e) => setV({ ...v, aiEnabled: e.target.checked })} className="mt-1" />
        <span>
          Run a first read on each application
          <span className="block text-[11px] text-stone-500">
            Claude drafts a score and evidence per dimension for the screener to check. Drafts never decide anything.
          </span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              try {
                await saveSettings(v);
                setMsg({ ok: true, text: "Saved." });
                router.refresh();
              } catch (e) {
                setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" });
              }
            })
          }
          className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700 disabled:bg-stone-300"
        >
          Save
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
