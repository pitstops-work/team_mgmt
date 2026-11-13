"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FundingWindowStatus } from "@/app/generated/prisma/client";
import {
  WINDOW_STATUS_LABELS,
  QUESTION_TYPES,
  type WindowQuestion,
  type QuestionType,
} from "@/lib/budget/proposalVocabulary";
import { saveWindow, setWindow, saveScoringSheet } from "../../proposals/actions";

type Criterion = { key: string; label: string; weight?: number; maxScore?: number; guidance?: string };

export default function WindowPanel({
  window: w,
  units,
  rubrics,
}: {
  window: {
    id: string;
    name: string;
    slug: string;
    status: FundingWindowStatus;
    nextStatuses: FundingWindowStatus[];
    grantingUnitId: string | null;
    opensOn: string;
    closesOn: string;
    brief: string;
    ceilingAmount: string;
    questions: WindowQuestion[];
    proposalCount: number;
  };
  units: { id: string; name: string }[];
  rubrics: { id: string; name: string; version: number; isActive: boolean; criteria: Criterion[] }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: w.name,
    slug: w.slug,
    grantingUnitId: w.grantingUnitId ?? "",
    opensOn: w.opensOn,
    closesOn: w.closesOn,
    brief: w.brief,
    ceilingAmount: w.ceilingAmount,
  });
  const [questions, setQuestions] = useState<WindowQuestion[]>(w.questions);
  const [newClose, setNewClose] = useState(w.closesOn);

  const [sheetName, setSheetName] = useState("");
  const [criteria, setCriteria] = useState<Criterion[]>([
    { key: "", label: "", weight: 1, maxScore: 10 },
  ]);

  const shapeFrozen = w.status === "open";
  const readOnly = w.status === "archived";

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    });
  }

  const label = "block text-xs text-stone-500 mb-1";
  const input = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm disabled:bg-stone-50";
  const btn = "rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50";

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* ── Status ───────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wide text-stone-400">Status</div>
          <div className="text-sm text-stone-700">{WINDOW_STATUS_LABELS[w.status]}</div>
        </div>
        {w.status === "draft" && (
          <p className="text-sm text-stone-500">
            Opening a call is publishing it: a public address starts serving a form, so
            whatever is wrong with the call at that moment is wrong in front of applicants.
            It needs a closing date in the future and published guidance.
          </p>
        )}
        {w.nextStatuses.length === 0 ? (
          <p className="text-sm text-stone-500">Archived. Nothing moves it from here.</p>
        ) : (
          <div className="space-y-2">
            {w.nextStatuses.includes("open") && (
              <div>
                <label className={label}>
                  {w.status === "closed"
                    ? "Reopening needs a new closing date — otherwise “reopened” and “never closed” are the same row"
                    : "Closing date"}
                </label>
                <input
                  className={input}
                  type="date"
                  value={newClose}
                  onChange={(e) => setNewClose(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {w.nextStatuses.map((s) => (
                <button
                  key={s}
                  className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 disabled:opacity-50"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      setWindow({
                        windowId: w.id,
                        to: s,
                        closesOn: s === "open" ? newClose || null : null,
                      }),
                    )
                  }
                >
                  {s === "open" ? (w.status === "closed" ? "Reopen" : "Open it") : WINDOW_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {w.proposalCount > 0 && w.nextStatuses.includes("archived") && (
              <p className="text-xs text-stone-400">
                Archiving is refused while proposals came in through this call — it would hide
                where they came from.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── The call itself ──────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-stone-400">The call</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Name</label>
            <input
              className={input}
              disabled={readOnly}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className={label}>Slug</label>
            <input
              className={input}
              disabled={readOnly}
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <div>
            <label className={label}>Opens</label>
            <input
              className={input}
              type="date"
              disabled={readOnly}
              value={form.opensOn}
              onChange={(e) => setForm((f) => ({ ...f, opensOn: e.target.value }))}
            />
          </div>
          <div>
            <label className={label}>Closes</label>
            <input
              className={input}
              type="date"
              disabled={readOnly}
              value={form.closesOn}
              onChange={(e) => setForm((f) => ({ ...f, closesOn: e.target.value }))}
            />
          </div>
          <div>
            <label className={label}>Granting unit</label>
            <select
              className={input}
              disabled={readOnly}
              value={form.grantingUnitId}
              onChange={(e) => setForm((f) => ({ ...f, grantingUnitId: e.target.value }))}
            >
              <option value="">None</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Indicative ceiling (₹)</label>
            <input
              className={input}
              inputMode="decimal"
              disabled={readOnly}
              value={form.ceilingAmount}
              onChange={(e) => setForm((f) => ({ ...f, ceilingAmount: e.target.value }))}
            />
            <p className="text-xs text-stone-400 mt-0.5">
              Indicative, and treated as such: a proposal above it is flagged, never refused.
            </p>
          </div>
        </div>
        <div>
          <label className={label}>Published guidance</label>
          <textarea
            className={input}
            rows={6}
            disabled={readOnly}
            value={form.brief}
            onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
          />
        </div>
      </section>

      {/* ── Questions ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wide text-stone-400">Questions</div>
          {shapeFrozen && (
            <span className="text-xs text-amber-700">
              shape frozen while open
            </span>
          )}
        </div>
        {shapeFrozen && (
          <p className="text-sm text-stone-600">
            Labels and guidance can still change. Adding, removing or re-typing a question
            cannot: answers are keyed by question key, so the ones already written would be
            orphaned — still in the row, no longer shown anywhere.
          </p>
        )}
        {questions.length === 0 && (
          <p className="text-sm text-stone-500">
            No questions. The form would collect the standard fields and nothing else.
          </p>
        )}
        <ul className="space-y-3">
          {questions.map((q, i) => (
            <li key={i} className="rounded border border-stone-200 p-3 space-y-2">
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label className={label}>Key</label>
                  <input
                    className={input}
                    disabled={readOnly || shapeFrozen}
                    value={q.key}
                    onChange={(e) =>
                      setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Label</label>
                  <input
                    className={input}
                    disabled={readOnly}
                    value={q.label}
                    onChange={(e) =>
                      setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label className={label}>Type</label>
                  <select
                    className={input}
                    disabled={readOnly || shapeFrozen}
                    value={q.type}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((x, j) => (j === i ? { ...x, type: e.target.value as QuestionType } : x)),
                      )
                    }
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm text-stone-600">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={q.required}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)),
                        )
                      }
                    />
                    Required
                  </label>
                </div>
                {!readOnly && !shapeFrozen && (
                  <div className="flex items-end">
                    <button
                      className="text-xs text-stone-500 hover:text-red-700"
                      onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  </div>
                )}
              </div>
              {q.type === "select" && (
                <div>
                  <label className={label}>Options, comma separated</label>
                  <input
                    className={input}
                    disabled={readOnly}
                    value={(q.options ?? []).join(", ")}
                    onChange={(e) =>
                      setQuestions((qs) =>
                        qs.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                options: e.target.value
                                  .split(",")
                                  .map((o) => o.trim())
                                  .filter(Boolean),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
              )}
              <div>
                <label className={label}>Help text</label>
                <input
                  className={input}
                  disabled={readOnly}
                  value={q.help ?? ""}
                  onChange={(e) =>
                    setQuestions((qs) => qs.map((x, j) => (j === i ? { ...x, help: e.target.value } : x)))
                  }
                />
              </div>
            </li>
          ))}
        </ul>
        {!readOnly && !shapeFrozen && (
          <button
            className="text-sm text-sky-600 hover:underline"
            onClick={() =>
              setQuestions((qs) => [...qs, { key: "", label: "", type: "text", required: false }])
            }
          >
            + Add a question
          </button>
        )}
      </section>

      {!readOnly && (
        <button
          className={btn}
          disabled={pending}
          onClick={() =>
            run(() =>
              saveWindow({
                id: w.id,
                name: form.name,
                slug: form.slug,
                grantingUnitId: form.grantingUnitId || null,
                opensOn: form.opensOn || null,
                closesOn: form.closesOn || null,
                brief: form.brief || null,
                ceilingAmount: form.ceilingAmount ? Number(form.ceilingAmount) : null,
                questions,
              }),
            )
          }
        >
          {pending ? "Saving…" : "Save the call"}
        </button>
      )}

      {/* ── Scoring sheets ───────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-stone-400">Scoring sheets</div>
        <p className="text-sm text-stone-500">
          A sheet is frozen onto each review when it is scored. Editing one that has been
          used makes a new version and retires the old, so a recorded total always describes
          a sheet that still exists.
        </p>
        {rubrics.length > 0 && (
          <ul className="space-y-1 text-sm">
            {rubrics.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span className="text-stone-700">
                  {r.name} <span className="text-stone-400 text-xs">v{r.version}</span>
                </span>
                <span className="text-xs text-stone-400">
                  {r.criteria.length} criteria · {r.isActive ? "active" : "retired"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="space-y-2 rounded border border-stone-200 p-3">
          <div>
            <label className={label}>New sheet name</label>
            <input className={input} value={sheetName} onChange={(e) => setSheetName(e.target.value)} />
          </div>
          {criteria.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-4">
              <input
                className={input}
                placeholder="key"
                value={c.key}
                onChange={(e) =>
                  setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))
                }
              />
              <input
                className={`${input} sm:col-span-2`}
                placeholder="label"
                value={c.label}
                onChange={(e) =>
                  setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <div className="flex gap-2">
                <input
                  className={input}
                  placeholder="max"
                  inputMode="numeric"
                  value={c.maxScore ?? ""}
                  onChange={(e) =>
                    setCriteria((cs) =>
                      cs.map((x, j) => (j === i ? { ...x, maxScore: Number(e.target.value) } : x)),
                    )
                  }
                />
                <input
                  className={input}
                  placeholder="×"
                  inputMode="decimal"
                  value={c.weight ?? ""}
                  onChange={(e) =>
                    setCriteria((cs) =>
                      cs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)),
                    )
                  }
                />
              </div>
            </div>
          ))}
          <div className="flex gap-3">
            <button
              className="text-sm text-sky-600 hover:underline"
              onClick={() => setCriteria((cs) => [...cs, { key: "", label: "", weight: 1, maxScore: 10 }])}
            >
              + criterion
            </button>
            <button
              className={btn}
              disabled={pending || !sheetName.trim()}
              onClick={() =>
                run(() =>
                  saveScoringSheet({ windowId: w.id, name: sheetName, criteria }),
                )
              }
            >
              {pending ? "Saving…" : "Save the sheet"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
