import Link from "next/link";
import { resolveGrantSpine, type StageState } from "@/lib/budget/spine";

/**
 * Where a grantee's own grants stand — the grantee face of the spine.
 *
 * The same resolver the internal grant page uses, run with
 * `audience: "partner"`, so the appraisal note, the reviewers' scores and the
 * RAG assessment are filtered out by `PARTNER_VISIBLE` rather than by anything
 * written here. There is deliberately no second list to keep in step: a
 * hand-maintained copy drifts, and the way it drifts is by leaking an internal
 * judgement into a grantee's browser.
 *
 * Why this exists at all: a grantee could see their budget and their reports,
 * but never that those were two stages of one thing, nor what was outstanding
 * at any other stage. The commonest support question a funder gets — "what are
 * you waiting on from us?" — had no screen that answered it.
 */

const DOT: Record<StageState, string> = {
  done: "bg-emerald-500",
  active: "bg-sky-500",
  blocked: "bg-amber-500",
  pending: "bg-stone-300",
  skipped: "bg-stone-200",
  unknown: "bg-stone-400",
};

/** Capped: a grantee with a long history should not wait on a dozen resolves. */
const MAX_GRANTS = 12;

export default async function GranteeGrantStages({ budgetIds }: { budgetIds: string[] }) {
  if (!budgetIds.length) return null;

  const spines = (
    await Promise.all(
      budgetIds.slice(0, MAX_GRANTS).map((id) => resolveGrantSpine(id, { audience: "partner" })),
    )
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  if (!spines.length) return null;

  return (
    <section className="mb-6 rounded-lg border border-stone-200 bg-white">
      <div className="flex items-baseline justify-between border-b border-stone-200 px-4 py-2">
        <h2 className="text-sm font-medium text-stone-700">Where your grants stand</h2>
        <span className="text-xs text-stone-400">
          What is done, and what is waiting on whom
        </span>
      </div>

      <div className="divide-y divide-stone-100">
        {spines.map((s) => {
          const current = s.stages.find((st) => st.key === s.activeKey);
          return (
            <div key={s.budgetId} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-stone-800">{s.name}</span>
                <span className="text-xs tabular-nums text-stone-400">
                  {s.progress.done} of {s.progress.total} stages done
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1">
                {s.stages.map((st, i) => {
                  const chip = (
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[st.state]}`} />
                      <span
                        className={`text-[11px] ${
                          st.key === s.activeKey
                            ? "font-medium text-sky-700"
                            : st.state === "done"
                              ? "text-stone-500"
                              : "text-stone-400"
                        }`}
                      >
                        {st.label}
                      </span>
                    </span>
                  );
                  return (
                    <span key={st.key} className="flex items-center">
                      {i > 0 && <span className="mx-1 h-px w-1.5 bg-stone-200" />}
                      {st.href ? (
                        <Link href={st.href} className="rounded px-1 py-0.5 hover:bg-stone-50">
                          {chip}
                        </Link>
                      ) : (
                        <span className="px-1 py-0.5">{chip}</span>
                      )}
                    </span>
                  );
                })}
              </div>

              {current?.summary && (
                <p className="mt-1.5 text-xs text-stone-500">
                  <span className="text-stone-400">{current.label}:</span> {current.summary}
                </p>
              )}
              {current?.blockers.map((b, i) => (
                <p key={i} className="mt-0.5 text-xs text-amber-800">
                  {b}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
