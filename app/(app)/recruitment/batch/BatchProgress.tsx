"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RotateCw, SkipForward } from "lucide-react";

/** Mirrors `RunProgress` in lib/recruitment/batchRunner.ts — keep the two in step. */
export type RunProgress = {
  id: string;
  status: string;
  title: string;
  error: string | null;
  totalCvs: number;
  doneCvs: number;
  currentLabel: string | null;
  /** Running, but no worker holds it — see the server type for why this exists. */
  stalled: boolean;
  desks: { key: string; label: string; slug: string | null; done: number; total: number; dupes?: number }[];
};

/**
 * Live view of a server-owned scouting run.
 *
 * The recruiter used to watch a spinner in the tab that WAS the run — closing
 * it killed the work. Now the run is on the server and this is only a window
 * onto it: it polls, it can be closed and reopened, and two people can watch
 * the same run. The one thing it can do is restart a parked run.
 */
export default function BatchProgress({ initial }: { initial: RunProgress }) {
  const router = useRouter();
  const [run, setRun] = useState<RunProgress>(initial);
  const [resuming, setResuming] = useState(false);
  const live = run.status === "running";

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/recruitment/batch/${run.id}/status`);
        if (!res.ok) return;
        const json = await res.json();
        if (stop || !json.run) return;
        setRun(json.run);
        // A finished desk is a new row on the page behind this panel, and a
        // finished run changes the page itself — pull both from the server
        // rather than reconstructing them here.
        if (json.run.doneCvs !== run.doneCvs || json.run.status !== run.status) router.refresh();
      } catch {
        // A poll that fails is a poll; the run is not affected by it.
      }
    };
    const t = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, run.id, run.doneCvs, run.status, router]);

  async function resume(skipStuck: boolean) {
    setResuming(true);
    try {
      const res = await fetch(`/api/recruitment/batch/${run.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipStuck }),
      });
      // Clear `stalled` too, or the panel stays in its stopped state until the
      // next poll comes back — the run is being restarted right now.
      if (res.ok) setRun((r) => ({ ...r, status: "running", error: null, stalled: false }));
    } finally {
      setResuming(false);
    }
  }

  if (run.status === "done") return null;

  const pct = run.totalCvs === 0 ? 0 : Math.round((run.doneCvs / run.totalCvs) * 100);
  const failed = run.status === "failed";
  // A run nobody is working is stuck whether or not it is labelled failed, and
  // it needs the same way out. Showing the spinner alone here is what left a
  // run sitting at 32/97 for two days with nothing to press.
  const stuck = failed || run.stalled;

  return (
    <div
      className={`rounded-xl border p-4 mb-5 ${stuck ? "border-rose-200 bg-rose-50/60" : "border-sky-200 bg-sky-50/60"}`}
    >
      <div className="flex items-start gap-2">
        {stuck ? (
          <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 text-sky-600 mt-0.5 shrink-0 animate-spin" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800">
            {stuck ? "The run stopped part-way" : `Scouting ${run.currentLabel ?? "…"}`}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
            {stuck
              ? "Everything already built is safe below, and the CVs that haven't been read yet are still held. Carrying on picks up exactly where it stopped — nothing is scouted twice."
              : "This runs on the server. You can close this tab, come back to this link, or hand it to someone else — the run carries on either way."}
          </p>
        </div>
        <span className="text-xs tabular-nums text-stone-500 shrink-0">
          {run.doneCvs}/{run.totalCvs} CVs
        </span>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-white/80 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${stuck ? "bg-rose-400" : "bg-sky-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 grid gap-1 sm:grid-cols-2">
        {run.desks.map((d) => {
          const complete = d.done >= d.total;
          return (
            <div key={d.key} className="flex items-center gap-1.5 text-[11px]">
              {complete ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
              ) : (
                <span className="w-3 h-3 shrink-0 rounded-full border border-stone-300" />
              )}
              <span className={`truncate ${complete ? "text-stone-600" : "text-stone-400"}`}>{d.label}</span>
              {!!d.dupes && (
                <span className="text-stone-400 shrink-0" title="Copies of CVs already on the desk, passed over">
                  · {d.dupes} repeat{d.dupes === 1 ? "" : "s"} skipped
                </span>
              )}
              <span className="ml-auto tabular-nums text-stone-400">
                {d.done}/{d.total}
              </span>
            </div>
          );
        })}
      </div>

      {run.error && (
        <p className={`mt-3 text-[11px] leading-relaxed ${stuck ? "text-rose-700" : "text-amber-700"}`}>{run.error}</p>
      )}

      {/* A stalled run has no `error` of its own to explain itself — it was never
          claimed long enough to record one — so say what happened. */}
      {!failed && run.stalled && !run.error && (
        <p className="mt-3 text-[11px] leading-relaxed text-rose-700">
          No worker has picked this up for a while. Carrying on starts it again from the last finished chunk.
        </p>
      )}

      {stuck && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => resume(false)}
            disabled={resuming}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {resuming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            Carry on from here
          </button>
          {/*
            The one failure carrying on cannot fix: a CV the extractor can't
            read. Without this the whole run is held hostage by one file. The
            runner halves its chunk on each failure, so by the time it parks
            this usually drops a single CV, not eight.
          */}
          <button
            onClick={() => resume(true)}
            disabled={resuming}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip what it&apos;s stuck on
          </button>
        </div>
      )}
    </div>
  );
}
