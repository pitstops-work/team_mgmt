# Grant ERP gap audit

**Date:** 11 November 2026 · **Scope:** code + schema only (`prisma/schema.prisma`,
the review DB's raw SQL, `app/(budget)`, `app/(review-portal)`, `app/partner`,
`lib/budget`, `lib/approvals`, `lib/review`). This says what the *software*
records, not what the team does in email and spreadsheets around it.

---

## 1. What is already here

Pitstops has the hard parts of a grant ERP — the parts most products get wrong:

| Capability | Where |
|---|---|
| One partner identity, with alias resolution | `Org` (kind=partner) + `OrgAlias`; `GrantPartner` is the per-granting-unit grant *relationship* |
| Due diligence, 8 stages, staged completion | review DB `org_due_diligence` (org_profile, governing_body, compliance_check, statutory_filings, salary_details, funding_income, expenditure, pdd) |
| Appraisal note, deterministic | `lib/approvals` — 6-step wizard, 21-rule TS rulebook, 5 doc renderers, agenda row, portfolio comparables, versioned (`assessment_versions`) |
| Grantee-authored appraisal input | `app/partner/approvals/[id]` — partner lane with lock/reopen |
| Parametric budget with provenance | `Budget` + `BudgetLine` + `CostRegistry`/`CostRegistryHistory`/`Component`, frozen `costSnapshot`, `LineTemplate.formula` |
| Multi-year, flexible horizon, inflation, multi-delivery-partner | `horizonMonths`, `partialPosition`, `inflation*Pct`, `BudgetDeliveryPartner` |
| Grantee draft co-editing, round-tracked | `partnerEditState`, `partnerRound`, `partnerBaseline`, `BudgetLineNote` |
| Excel round-trip | `/budget/import` ↔ export, `templateLayout.ts`, hidden `00.Meta` |
| Periodic financial reporting | `BudgetReportConfig` → `BudgetReportSlot` → `BudgetReport` + `BudgetReportLine`, reminder cron with per-recipient logs |
| Legal finance declaration | snapshot + hash + IP + UA + signed scan; `BudgetReportFd` |
| In-grant money movement | `BudgetReallocationRequest` (incl. carry-forward), `GrantBorrowing` + repayments |
| Year-end unspent analysis | `lib/budget/lapse.ts` |
| Portfolio dashboard | approved vs utilised by partner / grant lead / domain / granting unit |
| Applicant intake *pattern* | `ScreeningApplication` + rubric + L2/L3 reviews + `ScreeningEvent` audit — built for fellowship *individuals*, not org proposals |

Roughly: **appraise → budget → report** is strong. The gaps are on either side of
it and underneath it.

---

## 2. Tier 1 — the lifecycle chain is broken in five places

These are not features. They are missing links; without them the system cannot
answer basic questions about a grant.

### 2.1 No proposal intake, no pipeline

An organisation enters Pitstops only when a staff member creates an `Org` and a
blank `org_due_diligence` row (`lib/partners/reviewMirror.ts:87`). There is no:

- call for proposals / funding window / eligibility screen
- grantee-submitted concept note or LOI, and no LOI→full-proposal promotion
- pipeline stages, pipeline board, or ageing
- decline with a reason, at any pre-appraisal stage
- de-duplication against existing orgs at the point of application

`ScreeningApplication` proves the team can build this — it has intake
idempotency on a portal ref, structured answers, documents, a versioned rubric,
two review levels, divergence routing and a full event log. None of that is
reachable from the grant side.

### 2.2 No decision of record

`AssemblyStatus` declares `'approved'` and `'declined'` — **nothing in the
codebase ever writes them.** `submit-to-meeting` is the final transition
(`lib/approvals/repo.ts:329`). The grant instead becomes approved as a *side
effect of configuring reporting*: `app/(budget)/budget/report-actions.ts:39`
sets `Budget.status = "approved"` inside `setReportConfig`.

So there is no record of:

- the meeting itself (date, attendees, quorum, chair)
- the resolution — approved amount, period, variations from what was proposed
- **conditions.** `lib/approvals/schema.ts` defines a `Condition` shape for the
  appraisal, but nothing carries conditions forward, assigns them an owner or a
  due date, or records their discharge. A conditional approval is indistinguishable
  from a clean one the day after the meeting.
- dissent, abstention, conflict recusal, or minutes
- declines, and therefore no decline rate, no reason analysis

`Budget.approvedAt` / `approvedAmount` exist but are described in-schema as
*portfolio-comparables metadata*, nullable, backfilled — not a decision record.

### 2.3 No contracting stage

Nothing represents the grant agreement: no MOU object, no draft/execute states,
no signatory on either side, no execution date, no annexures binding the
approved budget and conditions, no amendment trail. "agreement" appears in the
codebase only as a *school plan artifact kind* and in `lib/templates.ts`.

The pattern already exists one module over: `SchoolPlanArtifact` (kinded,
versioned files incl. `partner_agreement`) + `SchoolPlanSignoff`
(prepared/reviewed/approved by + at). Grants have neither.

### 2.4 No funder-side money — the single largest gap

`BudgetReport.tranchesReceived` is **a number the grantee types into a form.**
There is no disbursement ledger. Missing entirely:

- tranche schedule (amount, planned date, release conditions)
- payment request → internal approval → release
- actual payment: date, amount, bank/UTR reference, instrument
- reconciliation of "we released X" against "they report receiving Y"
- refunds, recoveries, withheld tranches

Consequence: `lib/budget/grantAggregation.ts` can only compute
**approved vs utilised** (its own header says utilised = Σ reported actuals).
The three questions a grants finance team lives on — *committed*, *released*,
*spent* — reduce to two, and the middle one does not exist anywhere in the
system. Cash-flow forecasting, ageing of undisbursed commitments, and
interest-on-unspent checks are all unanswerable.

### 2.5 No closeout

`BudgetStatus` is `draft | final | approved`. A grant has no terminal state.
There is no final-report gate, final utilisation certificate, unspent-refund
settlement, asset register or asset disposition, exit/renewal decision, or
archival. `lib/budget/lapse.ts` *reports* unspent money as a sizing signal for
the next grant but nothing acts on it — no recovery, no adjustment against a
renewal.

---

## 3. Tier 2 — compliance and control

### 3.1 Compliance is a snapshot, not a calendar

Due diligence captures 12A, 80G, FCRA and CSR-1 as point-in-time JSON in
`compliance_check` / `statutory_filings`, and the approvals rulebook validates
them at appraisal. Nothing stores **validity windows or renewal due dates**, and
there is no cron watching them (compare the 20 crons that do exist — none is
compliance). An FCRA registration that lapsed mid-grant is invisible until
someone opens the DD page.

### 3.2 No statutory tax/donation reporting

No Form 10BD / 10BE, no CSR-2 or CSR annexure generation, no TDS on grant
payments (`tds` appears only as FD interest withholding in `BudgetReportFd`),
no PAN/registration validation.

### 3.3 No audit trail on the money

`AuditLog` exists and is called from ~56 files — **none of them in
`app/(budget)`, `app/(review-portal)`, `app/api/approvals`, `app/api/budget`,
`lib/budget`, `lib/approvals` or `lib/review`** (the one hit is
`(review-portal)/layout.tsx`, logging portal access). What partial history
exists is incidental: `assessment_versions` (rendered note snapshots),
`instruction_log`, `BudgetReportReminderLog`, `CostRegistryHistory`.

Not recorded anywhere: who edited an approved budget line, who approved a
report, who approved a reallocation and at what amount, who reopened a locked
partner step, who flipped a budget to approved. This is the gap that is hardest
to retrofit — the events are not recoverable later.

### 3.4 No delegation-of-authority matrix

Approval authority is two hardcoded tiers in the appraisal doc — `'gc'` and
`'under_1cr'` (`lib/approvals/schema.ts:33`) — used only to label the rendered
header. Operationally, report approval and reallocation approval gate on
`isBudgetAdminOrSuperAdmin`: **any budget admin can approve any amount.** There
is no configurable approval chain, no amount threshold enforcement, no
maker-checker, no segregation of duties (the same person can create, finalise
and approve), and no delegation during absence.

Pre-existing related weaknesses: six budget server actions still gate on
creator while the page is admin-gated, and the `PitstopEvent` PATCH scope check
is a known hole.

### 3.5 No conflict-of-interest or negative-list screening

`ScreeningApplication.conflictUserIds` handles recusal for fellowship
applicants. Nothing equivalent exists for grants, despite DD capturing exactly
the inputs for it — `PoliticalExposure` and `RelatedPartyLink` on every board
member. They are stored and rendered; nothing is screened against a watchlist,
and no COI declaration is required of an appraiser or committee member.

---

## 4. Tier 3 — the management layer

### 4.1 Grants are not joined to delivery

`Goal` has no `budgetId` or grant reference — it links to facility, needs
domain, settlement/cluster/zone/city, themes, quarters, programmes. Operations,
field visits, indicators, caregiver practices and the wiki all hang off
**geography + partner org**. Nothing in the schema says *this goal is funded by
grant X*.

So: no grant-level delivery report, no cost-per-outcome, no way to show a
funder (or a committee considering a renewal) what a specific grant bought. The
join is currently done by a human inferring it from partner + place.

### 4.2 Reporting is financial only

Report slots carry lines, bank position and FD details. There is no narrative
report, no results framework or logframe per grant, and no indicator
targets-vs-actuals per reporting period. The machinery to do it exists —
`GoalMetric`/`MetricDataPoint`, `FacilityIndicator*`, `ProgrammeJourneyOutcome*`
— but none of it is grant-scoped or slot-scoped.

### 4.3 Risk stops at appraisal

`lib/approvals/schema.ts` has `RiskCategory` + `RiskEntry` for the appraisal
note. The live `Risk` model is scoped to `goalId` / `pitstopId` only. Appraisal
risks therefore never become a monitored register with owners, review dates or
status, and there is no partner-level or grant-level risk rating that changes
monitoring intensity.

### 4.4 No monitoring visit record against a grant

`FieldVisit` / `FieldVisitStep` are operational and unlinked to grants. There is
no grant monitoring visit, verification finding, or corrective-action tracker
feeding back into report review. (`ActionPoint` could carry it — it is already
ad-hoc and assignable — but has no grant reference.)

### 4.5 No fund accounting, one currency, one entity

- **No source of funds.** There is no `Fund` / `DonorSource` model. You can see
  money going out and cannot see which restricted corpus, CSR donor or endowment
  it came from. Donor-restricted reporting is impossible.
- **No budget envelope.** Nothing caps commitments against an approved annual
  grants budget per `GrantingUnit`. No encumbrance, so over-commitment is only
  visible after the fact.
- **Single currency.** Every `currency` occurrence is `Intl.NumberFormat`
  formatting; INR is assumed throughout. No FX rate table, no revaluation.
- **`GrantingUnit` is a label, not an entity.** It has no bank account, no
  ledger, no envelope — only `registryCity` (which cost registry to generate
  from).

### 4.6 Portfolio reporting covers only live grants

The dashboard is approved-grants-only. Missing: pipeline view, commitment
schedule by year, cash-flow forecast, portfolio-level board pack, partner
scorecard across grants (timeliness, lapse rate, reallocation frequency — the
inputs all exist), and any time-series.

### 4.7 Documents are scattered, with no grant document set

Five unrelated homes: `Attachment` (ops), review-portal blob uploads,
`ScreeningApplication.documents` JSON, `SchoolPlanArtifact`,
`BudgetReport.declarationSignedScanUrl` / `bankStatementUrl`. There is no grant
document set, no required-document checklist with completeness state, no
retention or expiry, no versioning outside the schools module.

### 4.8 Grantee self-service is thin

A grantee login reaches: the appraisal partner form, draft budget editing,
report filing. Not: the agreement, disbursement status, a document locker, a
compliance to-do list, or a query thread outside per-line notes.

### 4.9 No external integrations

No accounting bridge (Tally / Zoho Books / ERPNext), no banking or payment file
export, no e-signature, no CRM or mail-merge. `bankStatementParsed` is the only
ingest and it is per-report. Email itself is currently a dead end — no Resend
sending domain is verified, so all mail 403s.

### 4.10 Grant truth is split across two databases with no FK

Appraisals and DD live in `REVIEW_DATABASE_URL` (raw `@neondatabase/serverless`
SQL); budgets, partners and reporting live in the main Prisma DB. They are
bridged by `lib/partners/reviewMirror.ts` and `lib/review/budget-bridge.ts`,
with `assessment_assemblies.budget_id` as a soft pointer. No referential
integrity, no cross-DB transaction, no consistency check. For an ERP this needs
to become either one boundary or an explicit, tested sync contract with a
reconciliation job.

### 4.11 The approved corpus is in two shapes

~30 notes from the frozen LLM orchestrator (`/grant-notes`, `grant_notes` +
`grant_note_sections`) remain readable but unmigrated, alongside the wizard's
`assessment_*` tables. Portfolio queries over history must handle both.

---

## 5. Suggested sequencing

Ordered by *what unblocks the most*, not by size.

**Phase 1 — close the chain.** Four objects, in this order:

1. `GrantDecision` (+ `GrantCondition`) — written by an approvals route that
   actually flips `AssemblyStatus` to approved/declined, carries the resolved
   amount and period, and owns the conditions register. Stop inferring approval
   from `setReportConfig`.
2. `GrantAgreement` (+ artifacts and a signoff row) — copy the
   `SchoolPlanArtifact` / `SchoolPlanSignoff` shape.
3. `Disbursement` (+ `DisbursementRequest`) — tranche schedule, release
   approval, actual payment with bank reference. Then make
   `tranchesReceived` a *reconciliation target* rather than the only record.
4. `GrantClosure` — final report gate, final UC, refund, asset disposition,
   terminal `BudgetStatus`.

**Phase 2 — control.** Call `auditLog` from every write in budget / approvals /
review (do this before Phase 1's objects accumulate history). Then a
`DelegationOfAuthority` table replacing `isBudgetAdminOrSuperAdmin` on
amount-bearing approvals, with maker-checker on report and reallocation
approval. Then a compliance calendar: validity dates on DD registrations plus a
daily cron on the pattern of `wiki-term-expiry`.

**Phase 3 — intake.** Proposal portal + pipeline, modelled on the screening
module (idempotent intake ref, structured answers, versioned rubric, event log),
with promotion into DD and appraisal.

**Phase 4 — results.** Add a grant reference to `Goal` (and to `ActionPoint` and
`Risk`), add a narrative/indicator section to report slots, and make the
appraisal's `RiskEntry` rows graduate into the live register.

**Phase 5 — consolidation.** `Fund` / `DonorSource` and per-unit envelopes;
multi-currency; the two-database decision; accounting and e-sign bridges.

---

## 6. Caveats

- This is a code and schema audit. Where a process happens outside the app
  (agreements signed on paper, disbursements tracked in Tally, committee
  minutes in a Drive folder), the gap is an *integration* gap, not an absence —
  but it is still a gap for an ERP.
- Named line numbers were accurate at commit `c9f2cd6`.
