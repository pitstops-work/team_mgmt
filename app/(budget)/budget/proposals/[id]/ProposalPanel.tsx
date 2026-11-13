"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProposalStage } from "@/app/generated/prisma/client";
import {
  PROPOSAL_STAGE_LABELS,
  DECLINE_REASONS,
  STAGES_NEEDING_REASON,
  declineReasonNeedsNote,
  declineReasonLabel,
} from "@/lib/budget/proposalVocabulary";
import {
  moveProposal,
  scoreOneProposal,
  setProposalOrg,
  setProposalAssignee,
  linkProposal,
  orgOptions,
} from "../actions";

/**
 * Everything that writes to one proposal.
 *
 * The stage picker offers exactly `nextStages`, which the server computed from
 * the same transition table it will check against — so the UI cannot present a
 * move that always errors. Every refusal rendered here came from the server;
 * the disabled states only save a round trip.
 */

type Review = {
  id: string;
  level: number;
  totalScore: number | null;
  recommendation: string | null;
  note: string | null;
  submittedAt: string | null;
  reviewerName: string | null;
  rubricName: string;
};

type Criterion = { key: string; label: string; maxScore?: number; weight?: number; guidance?: string };

export default function ProposalPanel({
  proposal,
  rubrics,
  assignees,
  unlinkedGrants,
}: {
  proposal: {
    id: string;
    publicRef: string;
    stage: ProposalStage;
    nextStages: ProposalStage[];
    declineReasonCode: string | null;
    declineReasonNote: string | null;
    orgId: string | null;
    orgName: string | null;
    applicantOrgName: string;
    assignedToId: string | null;
    budget: { id: string; name: string; status: string } | null;
    reviews: Review[];
  };
  rubrics: { id: string; name: string; version: number; criteria: Criterion[] }[];
  assignees: { id: string; name: string }[];
  unlinkedGrants: { id: string; name: string; status: string; granteeName: string | null }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Stage ──────────────────────────────────────────────────────────────────
  const [to, setTo] = useState<ProposalStage | "">("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const needsReason = to !== "" && STAGES_NEEDING_REASON.includes(to);

  // ── Scoring ────────────────────────────────────────────────────────────────
  const [rubricId, setRubricId] = useState(rubrics[0]?.id ?? "");
  const [level, setLevel] = useState(1);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [recommendation, setRecommendation] = useState("");
  const [scoreNote, setScoreNote] = useState("");
  const rubric = rubrics.find((r) => r.id === rubricId);

  // ── Org match ──────────────────────────────────────────────────────────────
  const [orgQuery, setOrgQuery] = useState("");
  const [orgResults, setOrgResults] = useState<{ id: string; name: string }[]>([]);

  // ── Link ───────────────────────────────────────────────────────────────────
  const [budgetId, setBudgetId] = useState("");

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
  const input = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";
  const btn = "rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50";

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* ── Where it is ──────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-xs uppercase tracking-wide text-stone-400">Stage</div>
          <div className="text-sm text-stone-700">{PROPOSAL_STAGE_LABELS[proposal.stage]}</div>
        </div>

        {proposal.declineReasonCode && (
          <div className="rounded border border-stone-200 bg-stone-50 px-2 py-1.5 text-sm text-stone-700">
            {declineReasonLabel(proposal.declineReasonCode)}
            {proposal.declineReasonNote ? ` — ${proposal.declineReasonNote}` : ""}
          </div>
        )}

        {proposal.nextStages.length === 0 ? (
          <p className="text-sm text-stone-500">
            {PROPOSAL_STAGE_LABELS[proposal.stage]} is where this one ends. Nothing moves it
            from here.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {proposal.nextStages.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setTo(s);
                    setReasonCode("");
                    setReasonNote("");
                  }}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    to === s ? "border-stone-800 text-stone-800" : "border-stone-300 text-stone-500"
                  }`}
                >
                  → {PROPOSAL_STAGE_LABELS[s]}
                </button>
              ))}
            </div>

            {needsReason && (
              <div className="space-y-2 rounded border border-stone-200 p-3">
                <div>
                  <label className={label}>
                    Why — this is the column the &ldquo;why we said no&rdquo; report groups by
                  </label>
                  <select
                    className={input}
                    value={reasonCode}
                    onChange={(e) => setReasonCode(e.target.value)}
                  >
                    <option value="">Choose a reason</option>
                    {DECLINE_REASONS.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {reasonCode && declineReasonNeedsNote(reasonCode) && (
                  <div>
                    <label className={label}>
                      &ldquo;{declineReasonLabel(reasonCode)}&rdquo; says nothing on its own — add the detail
                    </label>
                    <textarea
                      className={input}
                      rows={2}
                      value={reasonNote}
                      onChange={(e) => setReasonNote(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            <button
              className={btn}
              disabled={pending || to === "" || (needsReason && !reasonCode)}
              onClick={() =>
                run(() =>
                  moveProposal({
                    proposalId: proposal.id,
                    to: to as ProposalStage,
                    reasonCode: reasonCode || undefined,
                    reasonNote: reasonNote || undefined,
                  }),
                )
              }
            >
              {pending ? "Saving…" : to ? `Move to ${PROPOSAL_STAGE_LABELS[to as ProposalStage]}` : "Move"}
            </button>
          </div>
        )}
      </section>

      {/* ── Who and which organisation ───────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-stone-400">Identity and owner</div>

        <div>
          <label className={label}>Carried by</label>
          <select
            className={input}
            value={proposal.assignedToId ?? ""}
            disabled={pending}
            onChange={(e) =>
              run(() =>
                setProposalAssignee({
                  proposalId: proposal.id,
                  assigneeId: e.target.value || null,
                }),
              )
            }
          >
            <option value="">Nobody</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={label}>
            Registry organisation — typed as &ldquo;{proposal.applicantOrgName}&rdquo;
          </label>
          {proposal.orgId ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-700">{proposal.orgName}</span>
              <button
                className="text-xs text-stone-500 hover:text-stone-800"
                disabled={pending}
                onClick={() => run(() => setProposalOrg({ proposalId: proposal.id, orgId: null }))}
              >
                unmatch
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  className={input}
                  placeholder="Search the registry"
                  value={orgQuery}
                  onChange={(e) => setOrgQuery(e.target.value)}
                />
                <button
                  className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600"
                  disabled={pending || orgQuery.trim().length < 2}
                  onClick={() =>
                    start(async () => {
                      const rows = await orgOptions(orgQuery);
                      setOrgResults(rows.map((r) => ({ id: r.id, name: r.name })));
                    })
                  }
                >
                  Find
                </button>
              </div>
              {orgResults.length > 0 && (
                <ul className="divide-y divide-stone-100 rounded border border-stone-200">
                  {orgResults.map((o) => (
                    <li key={o.id} className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-sm text-stone-700">{o.name}</span>
                      <button
                        className="text-xs text-sky-600 hover:underline"
                        disabled={pending}
                        onClick={() =>
                          run(() => setProposalOrg({ proposalId: proposal.id, orgId: o.id }))
                        }
                      >
                        this one
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {orgResults.length === 0 && orgQuery.trim().length >= 2 && (
                <p className="text-xs text-stone-400">
                  Nothing found yet — press Find. Matching is a judgement, so it is recorded
                  against your name.
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Scores ───────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-stone-400">Scores</div>

        {proposal.reviews.length > 0 && (
          <ul className="space-y-2">
            {proposal.reviews.map((r) => (
              <li key={r.id} className="rounded border border-stone-200 px-2 py-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-stone-700">
                    {r.reviewerName} <span className="text-stone-400 text-xs">level {r.level}</span>
                  </span>
                  <span className="tabular-nums text-stone-700">{r.totalScore ?? "—"}</span>
                </div>
                <div className="text-xs text-stone-400">
                  {r.rubricName}
                  {r.recommendation ? ` · ${r.recommendation}` : ""}
                </div>
                {r.note && <p className="text-xs text-stone-600 mt-1">{r.note}</p>}
              </li>
            ))}
          </ul>
        )}

        {rubrics.length === 0 ? (
          <p className="text-sm text-stone-500">
            No scoring sheet exists for this call yet. One is authored against the call, so
            that editing it later makes a new version rather than changing a score already
            recorded.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Sheet</label>
                <select
                  className={input}
                  value={rubricId}
                  onChange={(e) => {
                    setRubricId(e.target.value);
                    setScores({});
                  }}
                >
                  {rubrics.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} v{r.version}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>Pass</label>
                <select className={input} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                  <option value={1}>First pass</option>
                  <option value={2}>Second pass</option>
                </select>
              </div>
            </div>

            {rubric?.criteria.map((c) => (
              <div key={c.key}>
                <label className={label}>
                  {c.label}
                  <span className="text-stone-300 ml-1">
                    0–{c.maxScore ?? 10}
                    {c.weight && c.weight !== 1 ? ` · ×${c.weight}` : ""}
                  </span>
                </label>
                <input
                  className={input}
                  inputMode="numeric"
                  value={scores[c.key] ?? ""}
                  onChange={(e) => setScores((s) => ({ ...s, [c.key]: e.target.value }))}
                />
                {c.guidance && <p className="text-xs text-stone-400 mt-0.5">{c.guidance}</p>}
              </div>
            ))}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Recommendation</label>
                <input
                  className={input}
                  value={recommendation}
                  onChange={(e) => setRecommendation(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>Note</label>
                <input className={input} value={scoreNote} onChange={(e) => setScoreNote(e.target.value)} />
              </div>
            </div>

            <p className="text-xs text-stone-400">
              Every criterion has to be scored. A weighted total over some of them is simply a
              smaller number than one over all of them, and nothing downstream can tell the
              difference.
            </p>

            <button
              className={btn}
              disabled={pending || !rubric}
              onClick={() =>
                run(() =>
                  scoreOneProposal({
                    proposalId: proposal.id,
                    rubricId,
                    level,
                    scores: Object.fromEntries(
                      Object.entries(scores)
                        .filter(([, v]) => v !== "")
                        .map(([k, v]) => [k, Number(v)]),
                    ),
                    recommendation: recommendation || undefined,
                    note: scoreNote || undefined,
                  }),
                )
              }
            >
              {pending ? "Saving…" : "Record the score"}
            </button>
          </div>
        )}
      </section>

      {/* ── Into a grant ─────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-stone-200 p-4 space-y-3">
        <div className="text-xs uppercase tracking-wide text-stone-400">Into a grant</div>
        {proposal.budget ? (
          <p className="text-sm text-stone-700">
            Linked to {proposal.budget.name} ({proposal.budget.status}). One proposal, one
            grant — the column is unique, so this cannot be pointed at a second.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-stone-500">
              Attaching a proposal to a grant is what makes the lifecycle one chain. It is
              refused for a declined proposal, and for one nobody has screened yet.
            </p>
            <select className={input} value={budgetId} onChange={(e) => setBudgetId(e.target.value)}>
              <option value="">Choose a grant with no proposal behind it</option>
              {unlinkedGrants.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.granteeName ?? "unassigned"} · {b.status}
                </option>
              ))}
            </select>
            <button
              className={btn}
              disabled={pending || !budgetId}
              onClick={() => run(() => linkProposal({ proposalId: proposal.id, budgetId }))}
            >
              {pending ? "Linking…" : "Link it"}
            </button>
            {unlinkedGrants.length === 0 && (
              <p className="text-xs text-stone-400">
                Every live grant already has a proposal behind it, or there are none.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
