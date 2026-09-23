"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileQuestion, Loader2, Trash2 } from "lucide-react";

export type TempCvRow = { name: string; code: string | null };

/**
 * CVs uploaded but never scouted, and what to do with them.
 *
 * Only appears when there are some. It exists because a run that dies leaves
 * its pool behind with nothing pointing at it — the CV URLs lived only in the
 * tab that uploaded them, so once that tab is gone the files are unreachable
 * from the app even though they are still sitting in the store. That is how
 * the 89-CV run of 2026-09-22 ended up 41 CVs short with no way back to them.
 *
 * Finishing them goes into an EXISTING desk rather than a new one, because the
 * desk they belong to is usually the half-built one the dead run left.
 */
export default function UnfinishedUploads({
  unscouted,
  scouted,
  unmatched,
  desks,
}: {
  unscouted: TempCvRow[];
  scouted: TempCvRow[];
  unmatched: TempCvRow[];
  desks: { slug: string; title: string }[];
}) {
  const router = useRouter();
  const [deskSlug, setDeskSlug] = useState(desks[0]?.slug ?? "");
  const [includeUnmatched, setIncludeUnmatched] = useState(false);
  const [busy, setBusy] = useState<"finish" | "clear" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const toScout = unscouted.length + (includeUnmatched ? unmatched.length : 0);

  async function finish() {
    setBusy("finish");
    setError(null);
    try {
      const res = await fetch("/api/recruitment/batch/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deskSlug, includeUnmatched }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Could not start the run (${res.status}).`);
      router.push(`/recruitment/batch/${json.batchId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function clear() {
    setBusy("clear");
    setError(null);
    try {
      const res = await fetch("/api/recruitment/cv-tmp", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not clear them.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-2">
        <FileQuestion className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800">
            {unscouted.length > 0
              ? `${unscouted.length} uploaded CV${unscouted.length === 1 ? " has" : "s have"} never been scouted`
              : "Uploaded CVs left over from finished runs"}
          </p>
          <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
            {unscouted.length > 0 ? (
              <>
                They were uploaded for a run that didn&apos;t finish. Nothing was lost — finish them into the desk they
                belong to and they&apos;ll be scouted on that desk&apos;s own axes, alongside the candidates already there.
              </>
            ) : (
              <>Every one of these is already on a desk. Clearing them is housekeeping.</>
            )}
          </p>
        </div>
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] text-stone-400 hover:text-stone-600 shrink-0">
          {open ? "hide" : "show files"}
        </button>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3 text-[11px]">
          {(
            [
              ["Never scouted", unscouted],
              ["Already on a desk", scouted],
              ["No code in the filename", unmatched],
            ] as const
          ).map(([label, rows]) => (
            <div key={label}>
              <p className="font-semibold uppercase tracking-wide text-stone-500 mb-1">
                {label} <span className="tabular-nums font-normal">({rows.length})</span>
              </p>
              <div className="max-h-40 overflow-auto space-y-0.5">
                {rows.length === 0 && <p className="text-stone-400 italic">None.</p>}
                {rows.map((r) => (
                  <p key={r.name} className="text-stone-500 truncate" title={r.name}>
                    {r.name}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {unscouted.length > 0 && desks.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            value={deskSlug}
            onChange={(e) => setDeskSlug(e.target.value)}
            disabled={!!busy}
            className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs text-stone-700 disabled:bg-stone-50 max-w-xs"
          >
            {desks.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.title}
              </option>
            ))}
          </select>
          <button
            onClick={finish}
            disabled={!!busy || !deskSlug}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy === "finish" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Scout {toScout} into this desk
          </button>
          {unmatched.length > 0 && (
            <label className="inline-flex items-center gap-1.5 text-[11px] text-stone-500">
              <input
                type="checkbox"
                checked={includeUnmatched}
                onChange={(e) => setIncludeUnmatched(e.target.checked)}
                disabled={!!busy}
              />
              include the {unmatched.length} without a code
            </label>
          )}
        </div>
      )}

      {scouted.length > 0 && (
        <button
          onClick={clear}
          disabled={!!busy}
          className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-stone-400 hover:text-rose-600 disabled:opacity-50"
        >
          {busy === "clear" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          Clear the {scouted.length} already on a desk
        </button>
      )}

      {error && <p className="mt-2 text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
