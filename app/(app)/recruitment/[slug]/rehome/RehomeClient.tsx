"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type City = { id: string; city: string; state: string | null };
type Proposal = {
  candidateId: string;
  name: string;
  homeState: string | null;
  place: string | null;
  reason: string;
  options: City[];
  toLocationId: string | null;
};
type Plan = { cities: City[]; missing: string[]; proposals: Proposal[] };
type Status = { pending: number; pendingByCity: Record<string, number>; errors: { name: string; error: string }[] };

export default function RehomeClient({ slug }: { slug: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"plan" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [started, setStarted] = useState(false);

  // Moves already under way (the tab was closed and reopened) show as progress.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/recruitment/${slug}/rehome`);
        if (!res.ok) return;
        const json: Status = await res.json();
        if (stop) return;
        setStatus(json);
        if (json.pending > 0) setStarted(true);
      } catch {
        // A failed poll changes nothing on the server.
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [slug]);

  async function makePlan() {
    setBusy("plan");
    setError(null);
    try {
      const res = await fetch(`/api/recruitment/${slug}/rehome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "plan" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Couldn't work it out (${res.status}).`);
      setPlan(json);
      setPicks(Object.fromEntries((json as Plan).proposals.map((p) => [p.candidateId, p.toLocationId ?? ""])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  const cityName = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of plan?.cities ?? []) m.set(c.id, c.city);
    return m;
  }, [plan]);

  const moves = Object.entries(picks)
    .filter(([, to]) => to)
    .map(([candidateId, toLocationId]) => ({ candidateId, toLocationId }));
  const byCity: Record<string, number> = {};
  for (const m of moves) byCity[m.toLocationId] = (byCity[m.toLocationId] ?? 0) + 1;

  async function apply() {
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch(`/api/recruitment/${slug}/rehome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply", moves }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Couldn't start the moves (${res.status}).`);
      setStarted(true);
      setStatus({ pending: json.queued, pendingByCity: byCity, errors: [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (started && status) {
    const done = status.pending === 0;
    return (
      <div className={`rounded-xl border p-4 ${done ? "border-emerald-200 bg-emerald-50/60" : "border-sky-200 bg-sky-50/60"}`}>
        <div className="flex items-start gap-2">
          {done ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-sky-600 mt-0.5 shrink-0 animate-spin" />
          )}
          <div className="flex-1">
            <p className="text-sm font-medium text-stone-800">
              {done ? "All moves done" : `Moving people — ${status.pending} still to go`}
            </p>
            <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
              {done
                ? "They're on their new desks, re-scouted against that city."
                : "A few at a time per city, a minute or two each. This runs on the server — you can close the tab and come back to this page."}
            </p>
          </div>
        </div>
        {status.errors.length > 0 && (
          <div className="mt-3 text-[11px] text-rose-700 space-y-0.5">
            <p className="font-medium">Left on this desk — move these by hand:</p>
            {status.errors.map((e, i) => (
              <p key={i}>
                {e.name}: {e.error}
              </p>
            ))}
          </div>
        )}
        {done && (
          <Link href={`/recruitment/${slug}`} className="mt-3 inline-block text-xs text-sky-700 hover:underline">
            Back to the desk
          </Link>
        )}
      </div>
    );
  }

  if (!plan) {
    return (
      <div>
        <button
          onClick={makePlan}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {busy === "plan" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {busy === "plan" ? "Reading everyone's CV…" : "Work out who goes where"}
        </button>
        <p className="mt-2 text-[11px] text-stone-400">Nothing moves yet — you'll see the list first.</p>
        {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
      </div>
    );
  }

  const unsure = plan.proposals.filter((p) => p.options.length > 1 && !picks[p.candidateId]).length;

  return (
    <div>
      {plan.missing.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[11px] text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Not on this JD, so nobody can go there: {plan.missing.join(", ")}. People from those states stay put.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
        {plan.proposals.map((p) => (
          <div key={p.candidateId} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm text-stone-800">{p.name}</p>
              <p className="text-[11px] text-stone-400">
                {p.homeState ?? "State unclear"}
                {p.place ? ` · ${p.place}` : ""} — {p.reason}
              </p>
            </div>
            <select
              value={picks[p.candidateId] ?? ""}
              onChange={(e) => setPicks((s) => ({ ...s, [p.candidateId]: e.target.value }))}
              className={`rounded-md border px-2 py-1 text-xs ${
                p.options.length > 1 && !picks[p.candidateId] ? "border-amber-300 bg-amber-50" : "border-stone-200"
              }`}
            >
              <option value="">Stay on Unplaced</option>
              {/* The rule's cities first; any other JD city is there for a correction. */}
              {p.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.city}
                </option>
              ))}
              {plan.cities
                .filter((c) => !p.options.some((o) => o.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.city} (outside the rule)
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={apply}
          disabled={busy !== null || moves.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {busy === "apply" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Move {moves.length} {moves.length === 1 ? "person" : "people"}
        </button>
        <span className="text-[11px] text-stone-500">
          {Object.entries(byCity)
            .map(([id, n]) => `${cityName.get(id) ?? id}: ${n}`)
            .join(" · ")}
          {` · staying: ${plan.proposals.length - moves.length}`}
        </span>
      </div>
      {unsure > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">
          {unsure} {unsure === 1 ? "person has" : "people have"} more than one allowed city and the CV didn&apos;t say which is
          nearer — pick one (highlighted), or they stay.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
