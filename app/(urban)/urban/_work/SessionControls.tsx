"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPin, CheckCircle2 } from "lucide-react";
import type { RoutineStatus } from "@/lib/urban/queries";
import { formatDay, relativeDue } from "@/lib/urban/time";
import { startSessionAction, arriveSessionAction, closeSessionAction } from "../work-actions";

const MODE_LABEL: Record<string, string> = { visit: "Visit", meeting: "Meeting", call: "Call" };

/** One routine on the effort page: this period's status and Start / Continue. */
export function RoutineCard({ effortId, r, canWork, setupOpen, today }: { effortId: string; r: RoutineStatus; canWork: boolean; setupOpen: number; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const s = r.session;
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800">{r.name}</p>
        <p className="text-xs text-stone-500">
          {r.cadence} · {MODE_LABEL[r.mode] ?? r.mode} · {r.items} items · this period ends {formatDay(r.period.end, today)}
          {!s?.closed && ` (${relativeDue(r.period.end, today)})`}
        </p>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {s?.closed ? (
        <Link href={`/urban/efforts/${effortId}/sessions/${s.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 size={14} /> Done this period</Link>
      ) : s ? (
        <Link href={`/urban/efforts/${effortId}/sessions/${s.id}`} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700">Continue · {s.open} open</Link>
      ) : canWork ? (
        <button
          disabled={pending || setupOpen > 0}
          title={setupOpen > 0 ? "Finish setup first" : undefined}
          onClick={() => start(async () => {
            const res = await startSessionAction(effortId, r.key);
            if (!res.ok) return setError(res.error);
            router.push(`/urban/efforts/${effortId}/sessions/${res.data!.sessionId}`);
          })}
          className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700 disabled:opacity-40"
        >
          {pending ? "Starting…" : `Start ${MODE_LABEL[r.mode]?.toLowerCase() ?? "session"}`}
        </button>
      ) : (
        <span className="text-xs text-stone-400">Not started</span>
      )}
    </div>
  );
}

/** Top-of-session controls: "I've reached" (visits) and Close. */
export function SessionControls({ sessionId, effortId, mode, arrivedAt, closed, requiredOpen, canWork }: {
  sessionId: string; effortId: string; mode: string; arrivedAt: string | null; closed: boolean; requiredOpen: number; canWork: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [note, setNote] = useState("");
  if (closed || !canWork) return null;
  const needsArrival = mode === "visit" && !arrivedAt;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {mode === "visit" && (
          arrivedAt ? (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><MapPin size={13} /> Arrived {new Date(arrivedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })}</span>
          ) : (
            <button disabled={pending} onClick={() => start(async () => { const r = await arriveSessionAction(sessionId); if (!r.ok) setError(r.error); router.refresh(); })} className="inline-flex items-center gap-1 rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50">
              <MapPin size={14} /> I&apos;ve reached
            </button>
          )
        )}
        <button
          disabled={pending || needsArrival}
          title={needsArrival ? "Mark “I've reached” first" : undefined}
          onClick={() => (requiredOpen ? setClosing(true) : start(async () => { const r = await closeSessionAction(sessionId, ""); if (!r.ok) return setError(r.error); router.push(`/urban/efforts/${effortId}`); }))}
          className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
        >
          Close {mode}
        </button>
      </div>
      {closing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm text-amber-900">{requiredOpen} required item{requiredOpen === 1 ? " is" : "s are"} still open. Closing now turns {requiredOpen === 1 ? "it" : "them"} into follow-ups, due in a week.</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why close early? (required)" rows={2} className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm outline-none" />
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setClosing(false)} className="rounded-lg px-3 py-1.5 text-sm text-stone-600">Cancel</button>
            <button disabled={pending || !note.trim()} onClick={() => start(async () => { const r = await closeSessionAction(sessionId, note); if (!r.ok) return setError(r.error); router.push(`/urban/efforts/${effortId}`); })} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Close early</button>
          </div>
        </div>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
