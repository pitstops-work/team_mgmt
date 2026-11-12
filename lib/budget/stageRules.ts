/**
 * The stage rules, as one pure function.
 *
 * Both the per-grant spine and the portfolio pipeline board need to answer
 * "what stage is this grant at, and what is stopping it". If each worked it out
 * for itself they would drift, and the way that drift shows up is the worst
 * possible way: the board says a grant is at Releases, the grant page says it
 * is blocked at Agreement, and nobody can tell which is lying.
 *
 * So the rules live here, take a flat bag of signals, touch no database, and
 * are checked by scripts/check-grant-invariants.ts. The two callers differ only
 * in how they GATHER signals — one grant with a rich read, or many grants with
 * a batched one — never in how they interpret them.
 *
 * `null` in a signal means "could not establish", which is not the same as
 * false. The review database holds due diligence and the appraisal note with no
 * foreign keys to here; when it cannot be read, the affected stages resolve to
 * `unknown` rather than to `pending`. Reporting an unreachable database as an
 * unstarted step is a lie that reads as a fact.
 */

export type StageKey =
  | "proposal"
  | "due_diligence"
  | "budget"
  | "appraisal"
  | "review"
  | "decision"
  | "agreement"
  | "documents"
  | "releases"
  | "reporting"
  | "assessment"
  | "closure";

export type StageState =
  | "done"
  | "active"
  | "blocked"
  | "pending"
  | "skipped"
  | "unknown";

export const STAGE_ORDER: StageKey[] = [
  "proposal",
  "due_diligence",
  "budget",
  "appraisal",
  "review",
  "decision",
  "agreement",
  "documents",
  "releases",
  "reporting",
  "assessment",
  "closure",
];

export const STAGE_LABELS: Record<StageKey, string> = {
  proposal: "Proposal",
  due_diligence: "Due diligence",
  budget: "Budget",
  appraisal: "Appraisal note",
  review: "Review",
  decision: "Decision",
  agreement: "Agreement",
  documents: "Documents",
  releases: "Releases",
  reporting: "Reporting",
  assessment: "Assessment",
  closure: "Closure",
};

/**
 * Who sees what, module by module — the access decision, written once.
 *
 * The ERP is internal and grantee-facing, and the two faces are NOT the same
 * list of modules. `false` means a grantee never sees that the stage exists.
 * Three are internal-only by design, each for the same reason: they hold a
 * candid judgement about the grantee, and candour survives only while it is not
 * addressed to its subject.
 *
 *   appraisal  — the note argues a case and quotes the appraiser's doubts
 *   review     — reviewers' scores and recommendations, written on that basis
 *   assessment — a RAG rating is a management conversation, not a notification
 *
 * The rest have a grantee face, usually a narrower view of the same stage
 * rather than a different screen. The grantee's spine is the internal one
 * filtered through this table, never a second list: a hand-maintained copy
 * drifts, and the way it drifts is by leaking.
 */
export const PARTNER_VISIBLE: Record<StageKey, boolean> = {
  proposal: true,
  due_diligence: true,
  budget: true,
  appraisal: false,
  review: false,
  decision: true,
  agreement: true,
  documents: true,
  releases: true,
  reporting: true,
  assessment: false,
  closure: true,
};

/** The eight due-diligence sections the review portal tracks. */
export const DD_SECTION_COUNT = 8;

/**
 * Everything the rules need, and nothing else. Flat and primitive on purpose:
 * it can be gathered from one rich query or a batched one, and it can be
 * written down in a test by hand.
 */
export type StageSignals = {
  /** Null when the grantee org is unassigned — nothing can be due-diligenced. */
  hasGrantee: boolean;
  hasProposal: boolean;
  proposalDecided: boolean;

  /** False when the review database could not be read. */
  reviewReachable: boolean;
  /**
   * Whether this grantee org exists in the review database at all. Distinct
   * from `ddSectionsComplete === null`, and the distinction matters: an org
   * nobody has mirrored is one where due diligence CANNOT be started, which is
   * a setup gap for whoever owns the link — not work the appraiser has yet to
   * do. Collapsing the two reads as "not started" and quietly assigns the
   * problem to the wrong person.
   */
  granteeMirrored: boolean;
  /** Null when there is no due-diligence record at all. */
  ddSectionsComplete: number | null;

  lineCount: number;
  budgetApproved: boolean;
  budgetClosed: boolean;

  hasAssembly: boolean;
  assemblyRendered: boolean;
  judgementRecorded: boolean;

  hasDecision: boolean;
  openPreDisbursementConditions: number;

  hasAgreement: boolean;
  agreementExecuted: boolean;

  documentCount: number;

  trancheCount: number;
  tranchesReleased: number;

  slotCount: number;
  slotsSubmitted: number;
  slotsOverdue: number;

  hasAssessment: boolean;

  /** GrantClosureStatus, or null when no closure row exists. */
  closureStatus: string | null;
};

export type StageVerdict = { state: StageState; blockers: string[] };

/**
 * The whole lifecycle's state, from signals alone.
 *
 * Note what is deliberately NOT here: any notion of a stage being unreachable
 * because an earlier one is incomplete. Grants do not work that way in
 * practice — a budget gets built while due diligence is still open, documents
 * arrive before the agreement is signed — and a spine that greys out
 * everything after the first gap would be wrong about every real grant.
 * Blocking is stated where it is actually enforced: releases and closure.
 */
export function buildStageStates(s: StageSignals): Record<StageKey, StageVerdict> {
  const out = {} as Record<StageKey, StageVerdict>;

  // ── Proposal ──────────────────────────────────────────────────────────────
  // A grant that predates the pipeline has no proposal and never will. That is
  // `skipped`: nothing is waiting on anybody, and calling it `pending` would
  // put every legacy grant permanently at the first stage.
  out.proposal = !s.hasProposal
    ? { state: "skipped", blockers: [] }
    : { state: s.proposalDecided ? "done" : "active", blockers: [] };

  // ── Due diligence ─────────────────────────────────────────────────────────
  if (!s.hasGrantee) {
    out.due_diligence = {
      state: "blocked",
      blockers: ["No grantee organisation is assigned to this grant."],
    };
  } else if (!s.reviewReachable) {
    out.due_diligence = { state: "unknown", blockers: [] };
  } else if (!s.granteeMirrored) {
    out.due_diligence = {
      state: "pending",
      blockers: [
        "This grantee is not linked to a due-diligence record, so none can be started.",
      ],
    };
  } else if (s.ddSectionsComplete === null) {
    out.due_diligence = { state: "pending", blockers: [] };
  } else {
    out.due_diligence = {
      state:
        s.ddSectionsComplete >= DD_SECTION_COUNT
          ? "done"
          : s.ddSectionsComplete > 0
            ? "active"
            : "pending",
      blockers: [],
    };
  }

  // ── Budget ────────────────────────────────────────────────────────────────
  out.budget =
    s.budgetApproved || s.budgetClosed
      ? { state: "done", blockers: [] }
      : s.lineCount === 0
        ? { state: "pending", blockers: ["The budget has no lines."] }
        : { state: "active", blockers: [] };

  // ── Appraisal note and its judgement ──────────────────────────────────────
  // Two stages over one wizard, because writing the case and judging it are
  // different acts by different people. Collapsing them is how a note comes to
  // argue its own conclusion.
  out.appraisal = !s.reviewReachable
    ? { state: "unknown", blockers: [] }
    : !s.hasAssembly
      ? { state: "pending", blockers: [] }
      : { state: s.assemblyRendered ? "done" : "active", blockers: [] };

  out.review = !s.reviewReachable
    ? { state: "unknown", blockers: [] }
    : !s.hasAssembly
      ? { state: "pending", blockers: [] }
      : { state: s.judgementRecorded ? "done" : "active", blockers: [] };

  // ── Decision ──────────────────────────────────────────────────────────────
  // Approved with no decision of record is `blocked`, not `done`. It is the
  // state every pre-existing grant is in, and it is the one state that stops
  // the rest of the lifecycle cold: there is no approved amount to release
  // against and no baseline to report variance from.
  out.decision = s.hasDecision
    ? { state: "done", blockers: [] }
    : s.budgetApproved
      ? {
          state: "blocked",
          blockers: [
            "Marked approved with no decision of record — nothing to release or close against.",
          ],
        }
      : { state: "pending", blockers: [] };

  // ── Agreement ─────────────────────────────────────────────────────────────
  out.agreement = s.agreementExecuted
    ? { state: "done", blockers: [] }
    : s.hasAgreement
      ? {
          state: "active",
          blockers: ["The agreement is drafted but not executed."],
        }
      : s.hasDecision
        ? { state: "pending", blockers: ["No agreement drafted."] }
        : {
            state: "blocked",
            blockers: ["No decision to draft an agreement from."],
          };

  // ── Documents ─────────────────────────────────────────────────────────────
  out.documents =
    s.documentCount > 0 ? { state: "done", blockers: [] } : { state: "pending", blockers: [] };

  // ── Releases ──────────────────────────────────────────────────────────────
  // The gate, stated as named blockers rather than one boolean. "Blocked" with
  // no reason is what makes people route around a system.
  const releaseBlockers: string[] = [];
  if (!s.hasDecision) releaseBlockers.push("No decision to release against.");
  if (!s.agreementExecuted) releaseBlockers.push("The agreement is not executed.");
  if (s.openPreDisbursementConditions > 0) {
    const n = s.openPreDisbursementConditions;
    releaseBlockers.push(
      `${n} pre-disbursement condition${n === 1 ? "" : "s"} still open.`,
    );
  }
  out.releases =
    s.trancheCount === 0
      ? releaseBlockers.length
        ? { state: "blocked", blockers: releaseBlockers }
        : { state: "pending", blockers: [] }
      : s.tranchesReleased >= s.trancheCount
        ? { state: "done", blockers: [] }
        : releaseBlockers.length
          ? { state: "blocked", blockers: releaseBlockers }
          : { state: "active", blockers: [] };

  // ── Reporting ─────────────────────────────────────────────────────────────
  out.reporting =
    s.slotCount === 0
      ? { state: "pending", blockers: [] }
      : s.slotsSubmitted >= s.slotCount
        ? { state: "done", blockers: [] }
        : s.slotsOverdue > 0
          ? {
              state: "blocked",
              blockers: [
                `${s.slotsOverdue} report${s.slotsOverdue === 1 ? "" : "s"} past due.`,
              ],
            }
          : { state: "active", blockers: [] };

  // ── Assessment ────────────────────────────────────────────────────────────
  // Nothing to assess until there is a reporting period to assess against, so
  // a grant with no schedule is `skipped` rather than permanently overdue.
  out.assessment = s.hasAssessment
    ? { state: "done", blockers: [] }
    : s.slotCount > 0
      ? { state: "pending", blockers: [] }
      : { state: "skipped", blockers: [] };

  // ── Closure ───────────────────────────────────────────────────────────────
  out.closure =
    s.closureStatus === "closed" || s.closureStatus === "closed_with_exception"
      ? { state: "done", blockers: [] }
      : s.closureStatus
        ? { state: "active", blockers: [] }
        : s.budgetClosed
          ? {
              state: "blocked",
              blockers: ["Marked closed with no closure record behind it."],
            }
          : { state: "pending", blockers: [] };

  return out;
}

/**
 * The one stage a person should be looking at.
 *
 * Earliest live or stuck stage wins. A `pending` stage late in the lifecycle is
 * not "now" — it is simply not its turn yet — so it only wins when nothing is
 * in progress or blocked anywhere.
 */
export function currentStage(
  states: Record<StageKey, StageVerdict>,
  opts: { audience?: "internal" | "partner" } = {},
): StageKey | null {
  const keys =
    opts.audience === "partner" ? STAGE_ORDER.filter((k) => PARTNER_VISIBLE[k]) : STAGE_ORDER;
  return (
    keys.find((k) => states[k].state === "active" || states[k].state === "blocked") ??
    keys.find((k) => states[k].state === "pending") ??
    null
  );
}
