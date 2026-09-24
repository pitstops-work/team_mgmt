"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { declareConflict, redraft, reopen, setFlag } from "../actions";

export default function ApplicationActions({
  applicationId,
  flags,
  isLead,
  decided,
}: {
  applicationId: string;
  flags: string[];
  isLead: boolean;
  decided: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>, after?: () => void) {
    setError(null);
    start(async () => {
      try {
        await fn();
        if (after) after();
        else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  const ask = (q: string) => window.prompt(q)?.trim() ?? null;

  return (
    <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 space-y-2 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {(["red_flag", "safeguarding"] as const).map((f) => {
          const on = flags.includes(f);
          const label = f === "red_flag" ? "red flag" : "safeguarding concern";
          if (on && !isLead) return null;
          return (
            <button
              key={f}
              disabled={pending}
              onClick={() => {
                const note = ask(on ? `Why is the ${label} being cleared?` : `What is the ${label}?`);
                if (note !== null) run(() => setFlag(applicationId, f, !on, note));
              }}
              className={f === "safeguarding" ? "text-rose-700 hover:underline" : "text-stone-700 hover:underline"}
            >
              {on ? `Clear ${label}` : `Raise ${label}`}
            </button>
          );
        })}
        <button
          disabled={pending}
          onClick={() => {
            const note = ask("Declare a conflict of interest. You won't see this application again. Optional note:");
            if (note !== null) run(() => declareConflict(applicationId, note), () => router.push("/seeding/screening"));
          }}
          className="text-stone-700 hover:underline"
        >
          Declare a conflict
        </button>
        <button disabled={pending} onClick={() => run(() => redraft(applicationId))} className="text-stone-500 hover:underline">
          Run the first read again
        </button>
        {isLead && decided && (
          <button
            disabled={pending}
            onClick={() => {
              const note = ask("Why is this application being reopened?");
              if (note) run(() => reopen(applicationId, note));
            }}
            className="text-violet-700 hover:underline"
          >
            Reopen for a lead decision
          </button>
        )}
      </div>
      <p className="text-[11px] text-stone-400">A safeguarding concern is shown to the central team at the top of their queue.</p>
      {error && <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-rose-700">{error}</p>}
    </div>
  );
}
