"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, RotateCw, SkipForward } from "lucide-react";

export type RunProgress = {
  id: string;
  status: string;
  title: string;
  error: string | null;
  totalCvs: number;
  doneCvs: number;
  currentLabel: string | null;
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
      if (res.ok) setRun((r) => ({ ...r, status: "running", error: null }));
    } finally {
      setResuming(false);
    }
  }

  if (run.status === "done") return null;

  const pct = run.totalCvs === 0 ? 0 : Math.round((run.doneCvs / run.totalCvs) * 100);
  const failed = run.status === "failed";

  return (
    <div
      className={`rounded-xl border p-4 mb-5 ${failed ? "border-rose-200 bg-rose-50/60" : "border-sky-200 bg-sky-50/60"}`}
    >
      <div className="flex items-start gap-2">
        {failed ? (
          <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
        ) : (
          <Loader2 className="w-4 h-4 text-sky-600 mt-0.5 shrink-0 animate-spin" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800">
            {failed ? "The run stopped part-way" : `Scouting ${run.currentLabel ?? "…"}`}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
            {failed
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
          className={`h-full rounded-full transition-all duration-500 ${failed ? "bg-rose-400" : "bg-sky-500"}`}
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
        <p className={`mt-3 text-[11px] leading-relaxed ${failed ? "text-rose-700" : "text-amber-700"}`}>{run.error}</p>
      )}

      {failed && (
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
            read. Without this the whole run is held hostage by one file.
          */}
          <button
            onClick={() => resume(true)}
            disabled={resuming}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
          >
            <SkipForward className="w-3.5 h-3.5" />
            Skip the CVs it&apos;s stuck on
          </button>
        </div>
      )}
    </div>
  );
}
