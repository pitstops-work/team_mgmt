"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Rag } from "@/app/generated/prisma/client";
import {
  RAGS,
  RAG_LABELS,
  RAG_MEANINGS,
  RAG_CLASSES,
  RAG_ORDER,
  worstRag,
  isOptimisticOverride,
  ASSESSMENT_WARN_DAYS,
  ASSESSMENT_STALE_DAYS,
} from "@/lib/budget/ragScale";
import { saveAssessment } from "../../grant-actions";

/**
 * Recording one judgement.
 *
 * Two axes rather than one because the programme view and the finance view
 * diverge often enough that a single colour hides the interesting case — a
 * programme going well on money being managed badly, or the reverse. The
 * overall is set by hand, not derived: the weighing IS the judgement.
 *
 * The form therefore pushes back in exactly one place. When the overall rating
 * is kinder than the worse of the two axes, it asks why, because that is the
 * most consequential thing anyone writes here and the least defensible left
 * blank. The server refuses it too; this only says so earlier.
 */

type Period = {
  id: string;
  slotNumber: number;
  periodFrom: string;
  periodTo: string;
  status: string;
  assessed: boolean;
};

type Entry = {
  id: string;
  slotId: string | null;
  slotNumber: number | null;
  periodFrom: string | null;
  periodTo: string | null;
  programmeRag: Rag;
  programmeRationale: string | null;
  financeRag: Rag;
  financeRationale: string | null;
  overallRag: Rag;
  overallNote: string | null;
  assessedOn: string;
  assessedByName: string | null;
};

function Pill({ rag }: { rag: Rag }) {
  return (
    <span className={`rounded border px-1.5 py-0.5 text-xs ${RAG_CLASSES[rag]}`}>
      {RAG_LABELS[rag]}
    </span>
  );
}

function Axis({
  title,
  hint,
  value,
  onChange,
  rationale,
  onRationale,
  error,
}: {
  title: string;
  hint: string;
  value: Rag | "";
  onChange: (r: Rag) => void;
  rationale: string;
  onRationale: (v: string) => void;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-sm font-medium text-stone-700">{title}</div>
        <div className="text-xs text-stone-500">{hint}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {RAGS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onChange(r)}
            title={RAG_MEANINGS[r]}
            className={`rounded border px-3 py-1 text-xs ${
              value === r ? RAG_CLASSES[r] : "border-stone-300 text-stone-500"
            }`}
          >
            {RAG_LABELS[r]}
          </button>
        ))}
      </div>
      {value && value !== "green" && (
        <div>
          <label className="block text-xs text-stone-500 mb-1">
            Why it is {RAG_LABELS[value].toLowerCase()} — required
          </label>
          <textarea
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            rows={3}
            value={rationale}
            onChange={(e) => onRationale(e.target.value)}
          />
        </div>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

export default function AssessmentPanel({
  budgetId,
  periods,
  history,
}: {
  budgetId: string;
  periods: Period[];
  history: Entry[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(history.length === 0);

  const [slotId, setSlotId] = useState<string>("");
  const [programmeRag, setProgrammeRag] = useState<Rag | "">("");
  const [programmeRationale, setProgrammeRationale] = useState("");
  const [financeRag, setFinanceRag] = useState<Rag | "">("");
  const [financeRationale, setFinanceRationale] = useState("");
  const [overallRag, setOverallRag] = useState<Rag | "">("");
  const [overallNote, setOverallNote] = useState("");

  const latest = history[0] ?? null;
  const previous = history[1] ?? null;
  const staleDays = latest
    ? Math.floor((Date.now() - new Date(latest.assessedOn).getTime()) / 86_400_000)
    : null;

  const bothAxes = programmeRag !== "" && financeRag !== "";
  const worst = bothAxes ? worstRag(programmeRag as Rag, financeRag as Rag) : null;
  const isOverride =
    bothAxes && overallRag !== "" && overallRag !== worst;
  const optimistic =
    bothAxes && overallRag !== "" &&
    isOptimisticOverride(programmeRag as Rag, financeRag as Rag, overallRag as Rag);

  const canSave =
    bothAxes &&
    overallRag !== "" &&
    (programmeRag === "green" || programmeRationale.trim() !== "") &&
    (financeRag === "green" || financeRationale.trim() !== "") &&
    (!isOverride || overallNote.trim() !== "");

  function submit() {
    setError(null);
    start(async () => {
      const res = await saveAssessment({
        budgetId,
        slotId: slotId || null,
        programmeRag: programmeRag as Rag,
        programmeRationale: programmeRationale || undefined,
        financeRag: financeRag as Rag,
        financeRationale: financeRationale || undefined,
        overallRag: overallRag as Rag,
        overallNote: overallNote || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  const input = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* ── Where it stands ──────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-stone-400">Current view</div>
        {!latest ? (
          <p className="text-sm text-stone-600">
            Never assessed. That is not the same as green — an unassessed grant is a gap
            in the record, and the portfolio view sorts it above the red ones for exactly
            that reason.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Pill rag={latest.overallRag} />
              <span className="text-sm text-stone-600">
                programme <Pill rag={latest.programmeRag} /> · finance{" "}
                <Pill rag={latest.financeRag} />
              </span>
            </div>
            <div className="text-xs text-stone-500">
              {latest.assessedOn}
              {latest.assessedByName ? ` · ${latest.assessedByName}` : ""}
              {latest.slotNumber !== null
                ? ` · period ${latest.slotNumber} (${latest.periodFrom} → ${latest.periodTo})`
                : " · off-cycle"}
            </div>
            {staleDays !== null && staleDays >= ASSESSMENT_WARN_DAYS && (
              <p
                className={`text-sm ${
                  staleDays >= ASSESSMENT_STALE_DAYS ? "text-red-700" : "text-amber-700"
                }`}
              >
                {staleDays} days old. A judgement about a grant&rsquo;s health this far back
                is a judgement about a different grant.
              </p>
            )}
            {previous && RAG_ORDER[latest.overallRag] !== RAG_ORDER[previous.overallRag] && (
              <p className="text-sm text-stone-600">
                Moved from {RAG_LABELS[previous.overallRag].toLowerCase()} to{" "}
                {RAG_LABELS[latest.overallRag].toLowerCase()} since {previous.assessedOn}
                {RAG_ORDER[latest.overallRag] < RAG_ORDER[previous.overallRag]
                  ? " — getting worse."
                  : " — improving."}
              </p>
            )}
            {latest.programmeRag !== latest.financeRag && (
              <p className="text-sm text-stone-600">
                The two axes disagree, which is the case a single rating would have hidden.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── Record one ───────────────────────────────────────────────────── */}
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-sm text-sky-600 hover:underline">
          + Record an assessment
        </button>
      ) : (
        <section className="rounded-lg border border-stone-200 p-4 space-y-5">
          <div className="text-xs uppercase tracking-wide text-stone-400">
            Record an assessment
          </div>

          <div>
            <label className="block text-xs text-stone-500 mb-1">Against which period</label>
            <select className={input} value={slotId} onChange={(e) => setSlotId(e.target.value)}>
              <option value="">Off-cycle — not tied to a reporting period</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  Period {p.slotNumber}: {p.periodFrom} → {p.periodTo} · {p.status}
                  {p.assessed ? " · already assessed" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-400">
              A period can hold one assessment, which this replaces. Off-cycle assessments
              each stand on their own — two site visits in a year are two judgements, not a
              correction of the first.
            </p>
            {periods.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">
                This grant has no reporting schedule, so there is nothing to anchor to.
                Anything recorded here is off-cycle.
              </p>
            )}
          </div>

          <Axis
            title="Programme"
            hint="Is the work happening, and is it doing what it was meant to do?"
            value={programmeRag}
            onChange={setProgrammeRag}
            rationale={programmeRationale}
            onRationale={setProgrammeRationale}
          />

          <Axis
            title="Finance"
            hint="Is the money being managed — spent at the right pace, accounted for, reported on time?"
            value={financeRag}
            onChange={setFinanceRag}
            rationale={financeRationale}
            onRationale={setFinanceRationale}
          />

          <div className="space-y-2 border-t border-stone-200 pt-4">
            <div>
              <div className="text-sm font-medium text-stone-700">Overall</div>
              <div className="text-xs text-stone-500">
                Yours to set, not computed from the two above. Weighing them is the
                judgement, and recording the weighing is the point of this screen.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {RAGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setOverallRag(r)}
                  title={RAG_MEANINGS[r]}
                  className={`rounded border px-3 py-1 text-xs ${
                    overallRag === r ? RAG_CLASSES[r] : "border-stone-300 text-stone-500"
                  }`}
                >
                  {RAG_LABELS[r]}
                </button>
              ))}
            </div>

            {isOverride && (
              <div>
                <label className="block text-xs text-stone-500 mb-1">
                  {optimistic
                    ? `You have called it ${RAG_LABELS[overallRag as Rag].toLowerCase()} overall with a ${RAG_LABELS[worst as Rag].toLowerCase()} axis. Say why — required.`
                    : `You have called it ${RAG_LABELS[overallRag as Rag].toLowerCase()} overall although neither axis is. Say why — required.`}
                </label>
                <textarea
                  className={input}
                  rows={3}
                  value={overallNote}
                  onChange={(e) => setOverallNote(e.target.value)}
                />
                {optimistic && (
                  <p className="mt-1 text-xs text-stone-500">
                    This is the most consequential sentence on the page. Unexplained, it
                    reads later as someone not having looked.
                  </p>
                )}
              </div>
            )}

            {!isOverride && (
              <div>
                <label className="block text-xs text-stone-500 mb-1">
                  Anything else worth knowing — optional
                </label>
                <textarea
                  className={input}
                  rows={2}
                  value={overallNote}
                  onChange={(e) => setOverallNote(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={submit}
              disabled={pending || !canSave}
              className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {pending ? "Saving…" : "Record it"}
            </button>
            {history.length > 0 && (
              <button onClick={() => setOpen(false)} className="text-sm text-stone-500">
                Cancel
              </button>
            )}
            {!canSave && bothAxes && (
              <span className="text-xs text-stone-400">
                A rating that is not green needs its reason.
              </span>
            )}
          </div>
        </section>
      )}

      {/* ── History ──────────────────────────────────────────────────────── */}
      {history.length > 0 && (
        <section className="rounded-lg border border-stone-200 p-4">
          <div className="text-xs uppercase tracking-wide text-stone-400 mb-2">
            Every view taken of this grant
          </div>
          <ul className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="rounded border border-stone-200 p-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Pill rag={h.overallRag} />
                    <span className="text-xs text-stone-500">
                      programme {RAG_LABELS[h.programmeRag].toLowerCase()} · finance{" "}
                      {RAG_LABELS[h.financeRag].toLowerCase()}
                    </span>
                  </span>
                  <span className="text-xs text-stone-400">
                    {h.assessedOn}
                    {h.assessedByName ? ` · ${h.assessedByName}` : ""}
                  </span>
                </div>
                <div className="text-xs text-stone-400">
                  {h.slotNumber !== null
                    ? `Period ${h.slotNumber}: ${h.periodFrom} → ${h.periodTo}`
                    : "Off-cycle"}
                </div>
                {h.programmeRationale && (
                  <p className="text-sm text-stone-600">
                    <span className="text-stone-400">Programme: </span>
                    {h.programmeRationale}
                  </p>
                )}
                {h.financeRationale && (
                  <p className="text-sm text-stone-600">
                    <span className="text-stone-400">Finance: </span>
                    {h.financeRationale}
                  </p>
                )}
                {h.overallNote && (
                  <p className="text-sm text-stone-700">
                    <span className="text-stone-400">Overall: </span>
                    {h.overallNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
