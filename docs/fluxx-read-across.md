# What Fluxx holds, and what of it is worth keeping

A read-only pass over the live Fluxx instance on 11 November 2026, to find
**facts the organisation captures** that our grant lifecycle has no home for.

No records were changed, nothing was exported, and no individual's name,
contact detail, identifier or organisation-specific figure is reproduced below.
Where an example is needed, the shape is described rather than the value.

## How to read this document

A data model is a set of assumptions, so a gap list drawn from Fluxx would be
Fluxx-shaped by construction — importing the failed design while believing only
the facts had been taken. Two sections, kept deliberately apart:

- **§1–2: domain facts.** Things APPI genuinely knows about a grant and we have
  nowhere to put. These are worth having whatever system holds them.
- **§4: hangovers.** Things Fluxx does that we should specifically NOT do, with
  the reason. Several are the visible symptoms of why it failed.

Anything in Fluxx that could not be justified from our own lifecycle on its own
terms has been left out of the recommendations and said so.

---

## 1. The six gaps worth closing

Ordered by how much they change the design, not by effort.

### 1.1 A grant has five role-holders, not one

Fluxx carries, per grant: **Program Lead**, **Program Finance**, **Effects and
Learning**, **Location Team**, and **Consultant**. We have `Budget.grantLeadId`
and nothing else.

This is not an administrative nicety — it is the organisation's own separation
of duties, already in use. Programme judgement and financial judgement sit with
different people, which is exactly the split that makes maker-checker mean
something: `excludeSubmitter` is weak if the only named person on the grant is
the one raising the request. The RAG assessment (§1.2) is likewise scored on two
axes by two different people.

**Recommendation.** A `GrantRoleAssignment` join (budgetId, userId, role) rather
than five more columns on `Budget`: the set will grow, people change mid-grant,
and a join keeps the history. `requireAuthority` should then be able to resolve
"the Program Finance for this grant" as a holder, which makes a two-person rule
expressible without naming individuals in the matrix.

### 1.2 A periodic health rating, split programme vs finance

Each reporting cycle carries a **RAG assessment on two axes** — Programme and
Programme Finance — each Red/Amber/Green with a **written rationale**, plus an
overall. The rationales observed were short, blunt and specific: budgeting
quality, underspend, reporting quality.

We have nothing equivalent. Our model can say what was spent and what was
reported; it cannot say *what a reviewer concluded about the grant's health*,
which is the thing a portfolio review actually runs on. A grant can be fully
compliant on paper and still be Red.

**Recommendation.** `GrantAssessment` — per reporting slot: `programmeRag`,
`programmeRationale`, `financeRag`, `financeRationale`, `overallRag`, assessor,
date. Rationale required when not Green: a bare colour with no reason is the
field people learn to ignore. This is also the natural home for the "what do we
think" half of a report review, which currently has only `reviewerNotes`.

### 1.3 Payments gate on named reports — and cancel when one is rejected

The payments table carries an explicit **Report Dependencies** column: a payment
names the report whose approval releases it, and the record showed a payment
**Canceled** because its dependency report was **Rejected**.

This validates `GrantTranche.gatingSlotId` as designed. What we have not
decided is the cascade: we implemented the gate (a blocked tranche cannot be
approved), but not what happens to a tranche whose gating report is finally
rejected rather than merely late.

**Recommendation.** Decide it explicitly rather than leaving it implicit. A
rejected gating report should move its tranche to a distinct state — not
`cancelled` silently, which destroys the plan, and not left `blocked` forever,
which quietly inflates the forward schedule. It is also a case where the
indicative/committed distinction matters: a cancelled tranche's money does not
simply disappear from the grant.

### 1.4 Refunds are first-class, and mid-grant

The payments table offers **Add a Refund** alongside Add Payment, at any point
in the grant — not only at closure. Our `refundAmount` / `refundReference` live
on `GrantClosure`, so a mid-grant return of money has nowhere to go and would
have to be recorded as a negative disbursement.

**Recommendation.** Allow a refund against the grant at any time, settling at
closure rather than only occurring there. The `recovered` disbursement status
half-covers this; the gap is a return initiated by the grantee rather than
clawed back by us.

### 1.5 Grant-to-organisation dependency ratio

Fluxx computes **grant request as a percentage of the grantee's last-three-year
average expenditure**, from three years of expenditure figures held on the
organisation. In the record seen it was around half.

This is a real appraisal and risk measure — how much of this organisation would
be us — and it needs org financial history we do not store at all. The same
three-year figures also support the "average annual expenditure" and
"dependency %" lines the approvals wizard already renders.

**Recommendation.** Three years of expenditure on `Org` (or a small
`OrgFinancialYear` table, which ages better), and the ratio derived rather than
typed. It belongs in the appraisal comparables alongside cost-per-beneficiary.

### 1.6 Grant lineage: which number of request is this?

Two related facts, both absent from our model:

- A classification of **New / Continuing / Scale up / Deepening**, plus a
  separate **Nature of Funding**.
- A **request sequence per partner** — the pipeline cards show "3rd Request"
  beside the ageing counter.

Our `Proposal` has no notion that this organisation has been funded before, and
`Budget` has no link to the grant it renews. Renewal is the single most common
shape of grant-making in a 30-partner portfolio, and we model it as if every
grant were the first.

**Recommendation.** `Budget.renewsBudgetId` (nullable, self-referencing) and a
`continuity` enum on the proposal. The sequence number is then derived, not
stored. This also gives `GrantClosure.adjustedIntoBudgetId` a sibling: closure
carries money forward, renewal carries the relationship forward.

---

## 2. Smaller additions, each cheap

- **A standard six-head budget summary** at request level — Salaries &
  Benefits, Office Administration, Travel, Audit/Evaluation/Learning, Programme
  Related, Other — held *independently* of the detailed budget. It makes grants
  comparable across partners whose detailed budgets are structured differently.
  Our `BudgetSection` may already cover this; worth checking the mapping is
  one-to-one rather than assuming.
- **Co-funding**: "Total Program Cost" and "Funding Source for Remaining Cost"
  as separate fields, i.e. this grant is a *share* of a larger project. This is
  the organisation-level analogue of `Goal.fundingSharePct`, and it is the
  honest denominator for cost-per-outcome.
- **Report types**, not just report periods: Narrative Report, Narrative Report
  *with payment*, Evaluation, Final Report. Our slots are homogeneous; an
  evaluation and a routine narrative are not the same obligation.
- **Report status includes Rejected**, not only sent-back. A rejected report is
  terminal for its period and cascades to payments (§1.3); our `sent_back`
  always implies a return trip.
- **"Data validated?" as an explicit flag** on reported effect figures, with
  "reporting periods covered till". Simpler and better than our
  `reviewerValue` dispute column for the common case, which is not "the
  reviewer disagrees" but "nobody has checked this yet".
- **Cumulative-to-date targets and achievements**, carried alongside the
  per-period figures. Our `GrantResultValue` is per-slot only, so a cumulative
  view has to be summed — which is wrong whenever an indicator is a stock
  (people reached) rather than a flow.
- **Decline reasons kept explicitly "for institutional memory"**, as a labelled
  long-form field beside the reason code. We have `declineReasonNote`; the
  framing is worth stealing, because it tells the person writing it who it is
  for.
- **Compliance document types we missed**: Form 10AB (both 12A and 80G
  applications), FC-4 annual return, NGO Darpan, POSH, procurement policy,
  finance policy, EPF/ESI/Professional Tax registrations, salary structure,
  governance chart. Validity dates are held for 12A/10(23C), 80G and FCRA —
  which confirms `OrgCompliance`'s validity window as the right shape.
- **A governance date set** — early pitch, programme DD visit (and who),
  finance/FMM visit (and who), FMM type, secondary visit, debrief, and the
  dates of each review forum. Several of these are already `GrantMeeting`; the
  *visit* dates with named visitors are not, and they are what evidences that
  due diligence actually happened.

---

## 3. What Fluxx confirms about our design

Worth recording because it is evidence we got something right, not just
assertion:

- **Validity windows on statutory registrations** are how the organisation
  already thinks about compliance — not point-in-time answers. `OrgCompliance`
  matches.
- **Requested vs Recommended vs Funded** are three distinct amounts. Our
  `approvedAmount` + `variationNote` covers the first two; Fluxx's "Amount
  Funded (Original)" shows the third is really the baseline, which is what
  `GrantDecision.budgetSnapshot` holds.
- **Ageing is measured in-stage, not only overall.** The pipeline cards show
  both total age and days in the current stage, which is what
  `proposalPipeline()` computes.
- **A grant has a Pending Closure state** between Granted and Closed, and
  closure has its own document checklist (audited UC, auditor's report, final
  report, bank statement for the closing period). `GrantClosure` plus
  `pre_closure` document requirements matches this exactly.
- **Payments carry a Scheduled → Paid → Canceled lifecycle** with a due date, a
  real amount, and a running "Amount Paid to Date / Pending Payment" pair. This
  is the tranche model, independently arrived at.

---

## 4. Hangovers to avoid

These are the parts to be deliberate about *not* carrying over.

### 4.1 Policy thresholds encoded in workflow state names

The real state machine, read from the record's own transition history:

```
Draft → New Concept → Invited Grant Pack → Programme Team Review
→ Debrief (for under 1 Cr) → GC Review → Board Review (above ₹10 Cr)
→ Grant Formalization → Granted → Pending Closure → Closed
```

Two of those states have **the approval threshold baked into the name**. When
the threshold moves, every historic record is labelled with a rule that no
longer exists, and renaming the state rewrites the past. It also means the
threshold cannot be queried, reported on, or varied by granting unit.

This is precisely what `AuthorityRule.maxAmount` + `policyReference` exists to
avoid, and it is the strongest argument for keeping the DoA matrix as data.

**Note for §2.2 of the build spec:** the observed thresholds are **under ₹1 Cr**
(Debrief) and **above ₹10 Cr** (Board), with GC Review between them. My seeded
placeholder rules used ₹1 Cr as the board threshold, which is **wrong** — it is
the bottom of the range, not the top. `scripts/seed-authority-rules.ts` should
be corrected to three bands before it is applied, and the open question stands:
whether these apply to the grant total or the annual outflow.

### 4.2 The reporting workflow left the system entirely

The record carries a link to an external spreadsheet where the actual
half-yearly reporting happens — **and a shared access key stored in plain text
in a field beside it**.

This is the clearest single piece of evidence about why Fluxx failed here: the
work moved out of the system and the system became the place you store the link
to where the work happens. Everything downstream — comparability, aggregation,
reminders, audit — is lost at that boundary.

Two implications for us. First, our structured `BudgetReport` + the narrative
and results layers have to be genuinely easier than a spreadsheet, or the same
thing will happen again. Second, if an external sheet is unavoidable for some
partners, the import path must be a real import (as
`/api/budget/disbursements/import` is for payments), not a URL field.

The stored credential should be raised with whoever administers Fluxx — it is a
shared secret sitting in a text field readable by everyone with record access.
It is not reproduced in this document.

### 4.3 One record that mutates from request to grant

In Fluxx a Request *becomes* a Grant: same record, changing states, with
sections appearing as it progresses. The appeal is obvious — nothing to
reconcile — and the cost is that the proposal as submitted is overwritten by
the grant as approved, so the question "what did they actually ask for" is
answerable only through the notes trail.

We split `Proposal` from `Budget`/`GrantDecision`, which keeps both. The thing
to get right is the handoff: `linkProposalToBudget()` must carry the
due-diligence and appraisal content forward, or the split costs us the context
that Fluxx at least kept in one place.

### 4.4 Dashboards as private saved searches

The dashboard is a per-user arrangement of saved-search cards, and the instance
carries personal and throwaway ones alongside shared ones. Nobody is looking at
the same numbers, and there is no canonical portfolio view to disagree with.

Our `/budget/dashboard` and `/budget/disbursements` are deliberately fixed
views. Keep them that way; add filters, not per-user dashboards.

### 4.5 Narrative where structure was needed

Much of the organisational record is long prose — approach, effectiveness,
achievements, awards. Appropriate for due diligence, and genuinely useful to
read. But it means almost nothing about a partner is queryable: you cannot ask
which partners work with adolescent girls, or which have a POSH policy, without
reading every record.

The lesson is not "less prose" — it is that the few facts you will want to
*filter* on (sector, geography, staff strength, policies held, registrations)
must be structured fields from the start, with the prose beside them rather
than instead of them.

---

## 5. What I did not take

For the record, so the omissions are deliberate rather than accidental:

- Fluxx's object model (Request-becomes-Grant), its state machine shape, and
  its terminology.
- Its approval-forum names (GRM, Debrief, SGM, BSC, GC). These are the
  organisation's own governance bodies and belong in seeded `GrantMeeting`
  forums as data — not as code, and not as enum values.
- Its dashboard and card metaphor.
- Everything individual: people, contacts, identifiers, and any amount or
  assessment attached to a named organisation.

---

## 6. Suggested next actions

1. **Correct the seeded authority thresholds** before anyone runs
   `scripts/seed-authority-rules.ts --apply` — three bands, not two (§4.1).
2. Decide the **rejected-gating-report cascade** (§1.3) — it is a one-line
   policy decision with a real consequence for the forward schedule.
3. Add, in one migration: `GrantRoleAssignment` (§1.1), `GrantAssessment`
   (§1.2), `Budget.renewsBudgetId` (§1.6), org financial history (§1.5).
4. Treat §2 as a checklist to work through when the remaining UI is built,
   rather than a second schema pass.
