"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveScope } from "../actions";

type Reviewer = { userId: string; name: string; geoId: string; geoLabel: string; districts: string[] };

export default function ScopeEditor({ reviewers }: { reviewers: Reviewer[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(reviewers.map((r) => [`${r.userId}:${r.geoId}`, r.districts.join(", ")])),
  );
  const [error, setError] = useState<string | null>(null);

  if (reviewers.length === 0) {
    return <p className="text-sm text-stone-400">No coordinators or geo POCs yet.</p>;
  }
  return (
    <div className="rounded-xl border border-stone-200 bg-white divide-y divide-stone-100">
      {reviewers.map((r) => {
        const k = `${r.userId}:${r.geoId}`;
        return (
          <div key={k} className="flex flex-wrap items-center gap-2 px-4 py-2">
            <div className="w-48">
              <p className="text-sm text-stone-800">{r.name}</p>
              <p className="text-[11px] text-stone-400">{r.geoLabel}</p>
            </div>
            <input
              value={drafts[k] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [k]: e.target.value })}
              placeholder="All districts"
              className="flex-1 min-w-[14rem] rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  try {
                    await saveScope(r.userId, r.geoId, (drafts[k] ?? "").split(","));
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Could not save");
                  }
                })
              }
              className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:border-stone-400"
            >
              Save
            </button>
          </div>
        );
      })}
      <p className="px-4 py-2 text-[11px] text-stone-400">Separate districts with commas. Leave empty for the whole geography.</p>
      {error && <p className="px-4 py-2 text-xs text-rose-700">{error}</p>}
    </div>
  );
}
