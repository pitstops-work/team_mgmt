"use client";

import { useTransition, useState } from "react";
import { loadStarterProgramme } from "../actions";

export function LoadStarterButton({ programmeKey }: { programmeKey: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="shrink-0 text-right">
      <button
        disabled={pending}
        onClick={() => start(async () => {
          const r = await loadStarterProgramme(programmeKey);
          setError(r.ok ? null : r.error);
        })}
        className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
      >
        {pending ? "Loading…" : "Load"}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
