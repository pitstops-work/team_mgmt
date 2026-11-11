# Grant ERP — build spec, Phases 1–5

Companion to [grant-erp-gap-audit.md](./grant-erp-gap-audit.md), which says what
is missing and why. This says what to build. Written against commit `c9f2cd6`.

Each phase is independently shippable and leaves the app working. Phases 1 and 2
are interleaved on purpose — see D5.

---

## 0. Cross-cutting decisions

These bind every phase. Settle them before writing migration one; changing them
later is expensive.

### D1 — New lifecycle models live in the main Prisma DB

Not in `REVIEW_DATABASE_URL`. Every object below needs real FKs to `Budget`,
`GrantPartner`, `Org`, `User` and `GrantingUnit`, and several must write inside
a transaction with a budget write (a decision that flips `Budget.status`; a
disbursement that must not half-commit).

The review DB keeps what it is good at: the appraisal narrative, DD stages,
rendered-note versions, comments. The link stays a **soft pointer with no FK**,
exactly as `assessment_assemblies.budget_id` already is today — just pointing
the other way:

```prisma
model GrantDecision {
  /// assessment_assemblies.id in REVIEW_DATABASE_URL. No FK: cross-database.
  /// Nullable because an admin note or a legacy grant may have no assembly.
  assemblyId String?
}
```

Add `lib/review/decisionBridge.ts` beside the existing
`lib/review/budget-bridge.ts` for the one write that has to cross: flipping
`assessment_assemblies.status` to `approved`/`declined` when a decision is
recorded. It is **best-effort and logged, never blocking** — the Prisma-side
decision is the record of truth, and a reconciliation job (Phase 5) catches
drift. Do not pretend the two writes are atomic.

### D2 — `Budget` stays the grant spine; amendments edit it in place

Today `Budget` *is* the grant: it already carries `grantPartnerId`,
`grantingUnitId`, `grantLeadId`, `horizonMonths`, `approvedAt`,
`approvedAmount`. Introducing a separate `Grant` entity in Phase 1 would touch
every query in `app/(budget)` and `lib/budget` for no immediate gain.

**An amendment therefore does not create a new `Budget` row.** Eight models key
to `budgetId` — `BudgetInputs` and `BudgetReportConfig` with `@unique`, plus
`BudgetLine`, `BudgetDeliveryPartner`, `BudgetReportSlot`, `BudgetReport`,
`BudgetLineNote` and `SchoolPlan`. Cloning the budget to represent a variation
would split one grant's reporting history across two rows, and the grant could
not hold a single report config at all. That is disqualifying.

Instead, **freeze the approved baseline into the decision** and edit the budget
in place — the discipline this codebase already uses in `costSnapshot`,
`partnerBaseline`, `CostRegistryHistory` and `declarationSnapshot`:

```prisma
model GrantDecision {
  /// The budget's lines exactly as approved, frozen at decision time. An
  /// amendment edits the live budget and records a NEW decision with its own
  /// snapshot, so "what did we approve, and when" survives every later edit
  /// without cloning the grant.
  budgetSnapshot Json
}
```

"The grant" stays one `Budget` row. The *approval history* is the
`GrantDecision` supersedes chain (§1.1), which already exists for exactly this.
Variance reporting is then snapshot-vs-live, computed by
`lib/budget/baselineDiff.ts` — reusing `partnerDiff.ts`, which already diffs a
frozen line set against the current one.

Consequences worth naming:
- `grantAggregation.ts` needs **no** chain-collapse step. Simpler than a clone.
- A mid-grant amendment that changes line amounts makes earlier filed reports
  compare against a superseded baseline. That is correct and must be *shown*:
  the report view reads the decision baseline that was live during its slot
  period, not today's lines.
- `GrantAgreement.amendsId` stays — a variation deed genuinely is a second
  document, even though the budget is one row.

Revisit only if a grant ever needs two concurrent budgets (two delivery
partners on separate agreements, each reporting separately). `isMultiPartner` +
`BudgetDeliveryPartner` already cover that case without a second row, so this
is unlikely to be needed.

### D3 — New money columns are `Decimal(14,2)`, not `Float`

All money becomes `Decimal(14,2)` — new columns from the start, and the
existing `Float` columns swept (the team's answer to Q1). A ledger that must
reconcile against a bank statement cannot be binary floating point: `0.1 + 0.2`
problems in money are unrecoverable, and the mixed-type alternative puts a
`compareMoney()` helper at every boundary with nothing enforcing its use — one
bare `===` and a reconciliation fails silently.

`lib/budget/money.ts` still ships, with `toDecimal()` / `toNumber()` /
`addMoney()`, because the API and UI boundaries still serialise through
`number`. What it no longer needs is a tolerance.

**The sweep is its own piece of work, and it is the riskiest migration in this
spec**, because `.env.local` points at production and Prisma's `Decimal` is not
assignment-compatible with `number` anywhere it is read. Do it deliberately:

1. Inventory every money column and every read of it (`BudgetLine.y1Total…
   y5Total` and friends, `BudgetReportLine.actualAmount`, `CostRegistry` rates,
   `GrantBorrowing`, the report and export paths). The compiler finds the reads
   once the types change — that is the point of doing it as one typed change
   rather than column by column.
2. Expect `Decimal.js` objects to surface in JSON responses as strings; every
   client-side arithmetic site must be converted, not coerced.
3. Run it against a Neon branch first and diff the exported workbooks
   byte-for-byte before and after. An export that changes is a bug in the
   sweep, not an improvement.
4. Land it **before Phase 1's writes**, in the same slot as §2.1 — the audit
   wrapper and the type sweep both get cheaper the earlier they happen, and
   both get more expensive once there are disbursement rows to migrate too.

Sizing: 2–3 weeks on its own, mostly in the export and report paths rather than
the migration.

### D4 — AuditLog records field diffs; domain tables record decisions

Do not build a second audit system. `lib/auditLog.ts` already has
`auditLog`, `auditLogMany` and `diffAudit`, and `lib/field/audit.ts` is the
worked example of a module-level wrapper. Follow it exactly.

The division of labour:

- **`AuditLog`** — "who changed this field, from what, to what". Fire-and-forget,
  never blocks, never throws. For edits.
- **Domain rows** (`GrantDecision`, `DisbursementApproval`, `GrantClosure`) —
  "this was decided, by whom, under what authority". Immutable, transactional,
  queryable. For decisions.

A decision is never *only* an audit row, and an edit is never *only* a domain
row.

### D5 — Phase 2's audit wrapper lands before Phase 1's objects

Out of numeric order, deliberately. The moment `GrantDecision` and
`Disbursement` start accumulating rows, their edit history starts mattering, and
unaudited edits from that window are gone for good. So:

1. **Phase 2a** — `lib/budget/audit.ts` + call sites on the *existing* budget,
   approvals and review writes (§2.1). One PR, no schema change beyond the
   `AuditEntityType` union.
2. Then Phase 1 in order, each new write audited from its first commit.
3. **Phase 2b–2d** — DoA, compliance calendar, COI (§2.2–§2.4).

### D6 — Every new amount-bearing route goes through one authority seam

`withBudgetLineWrite()` is the precedent: one function every line write passes
through. Phase 2b generalises it to `requireAuthority()` (§2.2). Phase 1 routes
are written to call it from day one, with a permissive default implementation
until Phase 2b fills it in — so Phase 2b is a change to one file, not to twelve
routes.

---

## Phase 1 — Close the lifecycle chain

Four objects. Ship in this order; each depends on the previous.

### 1.1 `GrantDecision` + `GrantCondition` — the decision of record

**Problem it fixes:** `AssemblyStatus` declares `'approved'`/`'declined'` and
nothing writes them; `Budget.status` becomes `approved` as a side effect of
`setReportConfig` (`app/(budget)/budget/report-actions.ts:39`); the appraisal's
`Condition` shape is defined and never carried forward.

#### Models

```prisma
enum GrantDecisionOutcome {
  approved
  approved_with_conditions
  deferred
  declined
  withdrawn            // applicant pulled out before the decision
}

enum GrantDecisionForum {
  grants_committee     // tier "gc"
  under_1cr            // tier "under_1cr"
  delegated            // approved under a DoA threshold, no meeting
}

/// The decision of record on one budget. Immutable once written: a changed mind
/// is a new decision row (`supersedesId`), not an edit. This is what makes a
/// grant approved — nothing else may set Budget.status = approved.
model GrantDecision {
  id        String  @id @default(cuid())
  budgetId  String
  budget    Budget  @relation(fields: [budgetId], references: [id], onDelete: Restrict)
  /// Soft pointer into REVIEW_DATABASE_URL (see D1). No FK.
  assemblyId String?

  outcome   GrantDecisionOutcome
  forum     GrantDecisionForum
  meetingId String?
  meeting   GrantMeeting? @relation(fields: [meetingId], references: [id], onDelete: SetNull)

  /// What was actually approved — may differ from what was proposed.
  approvedAmount   Decimal   @db.Decimal(14, 2)
  approvedFrom     DateTime  @db.Date
  approvedTo       DateTime  @db.Date
  /// Set when the forum approved less than asked, or a different shape.
  variationNote    String?

  /// The budget's lines exactly as approved, frozen here (see D2). An
  /// amendment edits the live budget and records a new decision with its own
  /// snapshot; variance is snapshot-vs-live via lib/budget/baselineDiff.ts.
  budgetSnapshot   Json

  /// Free text as minuted. The structured conditions live in GrantCondition.
  resolutionText   String
  /// Reason, required on deferred / declined / withdrawn.
  reasonCode       String?
  reasonNote       String?

  decidedAt     DateTime
  recordedById  String
  recordedBy    User     @relation("GrantDecisionRecorder", fields: [recordedById], references: [id], onDelete: Restrict)
  recordedAt    DateTime @default(now())

  /// A decision this one replaces (a revision at a later meeting).
  supersedesId  String?        @unique
  supersedes    GrantDecision? @relation("GrantDecisionRevision", fields: [supersedesId], references: [id], onDelete: SetNull)
  supersededBy  GrantDecision? @relation("GrantDecisionRevision")

  conditions    GrantCondition[]
  votes         GrantDecisionVote[]

  @@index([budgetId, decidedAt])
  @@index([outcome, decidedAt])
}

enum GrantConditionStatus {
  open
  evidence_submitted
  discharged
  waived
  breached
}

enum GrantConditionTiming {
  pre_disbursement   // blocks tranche 1 — enforced, see 1.3
  pre_tranche        // blocks the tranche named in blocksTrancheNumber
  during_grant
  pre_closure        // blocks closeout — enforced, see 1.4
}

/// One condition attached to an approval, with an owner and a due date. The
/// register the audit found missing: a conditional approval is otherwise
/// indistinguishable from a clean one the next day.
model GrantCondition {
  id         String        @id @default(cuid())
  decisionId String
  decision   GrantDecision @relation(fields: [decisionId], references: [id], onDelete: Cascade)

  sortOrder  Int           @default(0)
  /// Mirrors the appraisal's RiskCategory vocabulary where it applies, so a
  /// condition can be traced to the risk that produced it.
  category   String?
  text       String
  timing     GrantConditionTiming
  /// Required when timing = pre_tranche.
  blocksTrancheNumber Int?

  /// Who discharges it: internal staff, or the grantee.
  ownerUserId String?
  ownerUser   User?   @relation("GrantConditionOwner", fields: [ownerUserId], references: [id], onDelete: SetNull)
  ownerIsGrantee Boolean @default(false)
  dueDate     DateTime? @db.Date

  status      GrantConditionStatus @default(open)
  evidenceNote String?
  /// Uploaded proof lives in GrantDocument (1.2) with conditionId set.
  dischargedAt   DateTime?
  dischargedById String?
  dischargedBy   User?    @relation("GrantConditionDischarger", fields: [dischargedById], references: [id], onDelete: SetNull)
  /// Required on waived / breached.
  resolutionNote String?

  @@index([decisionId, sortOrder])
  @@index([status, dueDate])
  @@index([ownerUserId, status])
}

/// Per-member record for a committee decision. Optional: a delegated approval
/// has no votes. Exists so dissent and recusal are recorded, which the frozen
/// orchestrator's `grant_note_section_votes` did and the wizard dropped.
model GrantDecisionVote {
  id         String        @id @default(cuid())
  decisionId String
  decision   GrantDecision @relation(fields: [decisionId], references: [id], onDelete: Cascade)
  userId     String
  user       User          @relation("GrantDecisionVoter", fields: [userId], references: [id], onDelete: Restrict)
  /// for | against | abstain | recused
  vote       String
  note       String?

  @@unique([decisionId, userId])
}

enum GrantMeetingStatus {
  scheduled
  held
  cancelled
}

/// A committee sitting. Agenda rows are the assemblies submitted to it — the
/// existing `agenda-row.docx` renderer becomes the per-row renderer for a
/// whole-meeting pack.
model GrantMeeting {
  id             String             @id @default(cuid())
  grantingUnitId String?
  grantingUnit   GrantingUnit?      @relation(fields: [grantingUnitId], references: [id], onDelete: SetNull)
  forum          GrantDecisionForum
  heldOn         DateTime           @db.Date
  status         GrantMeetingStatus @default(scheduled)
  chairUserId    String?
  chairUser      User?              @relation("GrantMeetingChair", fields: [chairUserId], references: [id], onDelete: SetNull)
  /// Members present, as user ids. Plain array, not a join table: attendance is
  /// a fact about the meeting, never queried from the person's side.
  attendeeUserIds String[]          @default([])
  /// Null = no quorum rule configured for this forum yet.
  quorumRequired  Int?
  minutesUrl      String?
  notes           String?
  createdAt       DateTime           @default(now())

  decisions GrantDecision[]

  @@index([forum, heldOn])
}
```

#### Invariants (enforce in code, and in a DB constraint where cheap)

1. **Only a decision approves a grant.** `setReportConfig` stops setting
   `Budget.status`. Recording a decision with outcome `approved` or
   `approved_with_conditions` is the *only* write that sets
   `status = approved`, `approvedAt = decidedAt`, `approvedAmount`. Everything
   else refuses.
2. A budget has **at most one live decision**: the head of the `supersedes`
   chain. `activeDecision(budgetId)` in `lib/budget/decision.ts` is the only
   reader; nothing queries `GrantDecision` directly.
3. `outcome = approved_with_conditions` requires ≥1 `GrantCondition`. A
   plain `approved` requires zero — if someone adds a condition afterwards, the
   outcome flips, which is a new decision row.
4. `deferred` / `declined` / `withdrawn` require `reasonCode`.
4a. **A deferral keeps the assembly open** (Q2). Re-presentation is a second
   decision on the *same* assembly, chained by `supersedesId` — not a new
   assembly. Two consequences: the bridge (D1) flips the assembly to a
   `deferred` state that is distinct from in-progress, so ageing reports do not
   read a committee deferral as staff sitting on a file; and a decision's
   `supersedes` chain is the audit answer to "how many times did this go to the
   board", which no new-assembly-per-attempt model can answer without stitching
   records together by hand.
5. A decision is immutable. No PATCH route. `status` on its conditions is the
   only thing that moves afterwards.
6. `GrantDecision.approvedAmount` need not equal the budget's computed total —
   that is the *point* of `variationNote`. Surface the delta; never reconcile it
   silently.
7. `assertPartnerEditClosed` stays: a decision refuses while the grantee holds
   the draft open.

#### Routes and actions

| Route | Method | Who | Notes |
|---|---|---|---|
| `app/(budget)/budget/decision-actions.ts` → `recordDecision()` | server action | `grant_decision.create` | Transaction: insert decision + conditions + votes, update `Budget`, `auditLog`. Then best-effort `decisionBridge.flipAssembly()`. |
| `dischargeCondition()` | server action | `grant_condition.update` | Evidence + optional `GrantDocument`. |
| `waiveCondition()` | server action | `grant_condition.waive` | Separate permission on purpose — waiving is an authority act. |
| `/api/approvals/[id]/decision` | POST | same | Thin wrapper so the approvals wizard can record from the review-portal side. Calls the same action. |
| `/api/grant-meetings` + `/[id]` | CRUD | `grant_meeting.*` | |
| `/api/grant-meetings/[id]/pack.docx` | GET | `grant_meeting.read` | Compiles `lib/approvals/renderers/agenda.ts` rows for every assembly on the meeting into one deck. |

Replace `markSubmittedToMeeting`'s dead end: `submit-to-meeting` gains an
optional `meetingId`, so a submitted assembly is already on an agenda.

#### UI

- **`/approvals/[id]`** — a seventh wizard step, `decision`, visible only after
  `submitted`. Shows the rendered note read-only, then the decision form.
  `WizardStep` enum gains `'decision'`.
- **`/budget/[id]`** — a decision banner replacing the bare `approved` chip:
  outcome, amount approved vs proposed, period, and an open-conditions count
  that links to the register.
- **`/budget/[id]/conditions`** — the register. Grouped by timing, overdue first.
- **`/budget/conditions`** — cross-portfolio: every open condition by owner and
  due date. This is the page that makes the register real rather than decorative.
- **`/budget/meetings`** + `/budget/meetings/[id]` — agenda, attendance, quorum
  warning, decisions recorded, minutes upload, pack download.
- **`/budget/dashboard`** — new "Decisions" section: approved / declined /
  deferred counts by period and forum, and decline reasons.

#### RBAC

New permissions: `grant_decision.create`, `grant_decision.read`,
`grant_condition.read`, `grant_condition.update`, `grant_condition.waive`,
`grant_meeting.create`, `grant_meeting.read`, `grant_meeting.update`.

New surfaces: `budget.decision_form`, `budget.conditions`, `budget.meetings`,
`approvals.decision_step`.

Seed with `scripts/seed-role.ts` for the affected roles only — **never
`seed-rbac.ts`**, which resets every role. Dry-run diff first.

Middleware: a grantee owns conditions where `ownerIsGrantee`, so
`partnerAllowedPath` gains `/budget/[id]/conditions` and
`/api/budget/[^/]+/conditions/`. Without the middleware entry the RBAC grant
alone silently redirects.

#### Migration + backfill

`prisma/migrations/2026…_grant_decision/` — additive, no destructive change.

Backfill (`scripts/backfill-grant-decisions.ts`, dry-run by default): every
budget already at `status = approved` gets a synthetic decision —
`outcome = approved`, `forum` from the assembly tier where one is linked else
`delegated`, `decidedAt` from `approvedAt` else `BudgetReportConfig.grantStartDate`
else `createdAt`, `approvedAmount` from `approvedAmount` else the computed total,
`resolutionText = "Backfilled from pre-decision-record data."`,
`recordedById` = the migrating admin.

These are honest placeholders, not inventions: flag them with
`reasonCode = "backfilled"` so portfolio stats can exclude them, and do not
backfill conditions at all — nobody knows what they were.

#### Tests

- `recordDecision` is transactional: a failing condition insert leaves
  `Budget.status` untouched.
- `setReportConfig` on a budget with no decision throws.
- `approved_with_conditions` with zero conditions throws.
- Superseding a decision leaves exactly one head.
- `activeDecision` over a 3-long chain returns the head.
- The review-DB bridge failing does not fail the decision.

#### Done when

A grant cannot reach `approved` without a decision row; every open condition
appears on one page with an owner and a due date; and the dashboard can state
last quarter's approval and decline counts.

---

### 1.2 `GrantAgreement` + `GrantDocument` — contracting and one document set

**Problem it fixes:** nothing represents the agreement. And documents live in
five unrelated homes (`Attachment`, review-portal blobs,
`ScreeningApplication.documents` JSON, `SchoolPlanArtifact`,
`BudgetReport.declarationSignedScanUrl` / `bankStatementUrl`), with no grant
document set and no completeness state.

Copy the shape that already works one module over: `SchoolPlanArtifact`
(kinded, versioned files) + `SchoolPlanSignoff` (prepared / reviewed / approved
by + at).

#### Models

```prisma
enum GrantAgreementStatus {
  drafting
  sent_for_signature
  executed
  terminated
}

/// The agreement for one budget. One live agreement per budget; an amendment
/// gets its own agreement row chained by `amendsId` (see D2).
model GrantAgreement {
  id       String @id @default(cuid())
  budgetId String @unique
  budget   Budget @relation(fields: [budgetId], references: [id], onDelete: Restrict)

  status   GrantAgreementStatus @default(drafting)
  /// Internal reference as it appears on the paper.
  reference String?

  /// Signatories, as names + roles rather than FKs: the grantee's signatory is
  /// usually not a Pitstops user, and the internal one may have left.
  granteeSignatoryName  String?
  granteeSignatoryRole  String?
  granteeSignedOn       DateTime? @db.Date
  funderSignatoryName   String?
  funderSignatoryRole   String?
  funderSignedOn        DateTime? @db.Date

  executedOn   DateTime? @db.Date
  effectiveFrom DateTime? @db.Date
  effectiveTo   DateTime? @db.Date

  terminatedOn  DateTime? @db.Date
  terminationReason String?

  /// The release rhythm this grant's money follows (Q3). Annual is the norm;
  /// creche and urban operational grants run quarterly or half-yearly. The
  /// tranche generator splits each budget year total across this frequency.
  trancheFrequency TrancheFrequency @default(annual)

  /// The agreement this one amends (a variation deed).
  amendsId String?         @unique
  amends   GrantAgreement? @relation("AgreementAmendment", fields: [amendsId], references: [id], onDelete: SetNull)
  amendedBy GrantAgreement? @relation("AgreementAmendment")

  signoff  GrantAgreementSignoff?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status, executedOn])
}

/// Internal clearance before the agreement goes out — the SchoolPlanSignoff
/// shape, unchanged.
model GrantAgreementSignoff {
  id            String         @id @default(cuid())
  agreementId   String         @unique
  agreement     GrantAgreement @relation(fields: [agreementId], references: [id], onDelete: Cascade)
  preparedById  String?
  preparedAt    DateTime?
  reviewedById  String?
  reviewedAt    DateTime?
  reviewerNotes String?
  approvedById  String?
  approvedAt    DateTime?
  approvalNotes String?
}

enum GrantDocumentKind {
  proposal
  dd_evidence
  appraisal_note
  board_minutes
  agreement_draft
  agreement_executed
  amendment_deed
  condition_evidence
  budget_workbook
  financial_report
  narrative_report
  utilisation_certificate
  audited_accounts
  registration_certificate   // 12A / 80G / FCRA / CSR-1 — see 2.3
  bank_statement
  bank_mandate
  disbursement_advice
  monitoring_report
  asset_register
  closure_report
  other
}

/// The grant document set. One row per file, attachable to the budget and
/// optionally to the specific object it evidences. Replaces nothing on day one:
/// new uploads land here, and §1.2 backfill points existing URLs at it.
model GrantDocument {
  id       String @id @default(cuid())
  budgetId String
  budget   Budget @relation(fields: [budgetId], references: [id], onDelete: Cascade)

  kind     GrantDocumentKind
  name     String
  url      String
  size     Int?
  mimeType String?
  caption  String?
  /// Bumped on re-upload under the same (budgetId, kind, name). Old rows kept.
  version  Int     @default(1)

  /// What this file evidences. All nullable, at most one set.
  conditionId    String?
  condition      GrantCondition?  @relation(fields: [conditionId], references: [id], onDelete: SetNull)
  agreementId    String?
  agreement      GrantAgreement?  @relation(fields: [agreementId], references: [id], onDelete: SetNull)
  reportId       String?
  report         BudgetReport?    @relation(fields: [reportId], references: [id], onDelete: SetNull)
  disbursementId String?
  disbursement   Disbursement?    @relation(fields: [disbursementId], references: [id], onDelete: SetNull)

  /// Visible to the grantee login. Internal appraisal notes are not.
  granteeVisible Boolean @default(false)
  /// Grantee uploads set this; staff uploads leave it false.
  uploadedByGrantee Boolean @default(false)

  uploadedById String?
  uploadedBy   User?    @relation("GrantDocumentUploader", fields: [uploadedById], references: [id], onDelete: SetNull)
  createdAt    DateTime @default(now())

  @@index([budgetId, kind])
  @@index([conditionId])
}

/// Which document kinds a grant must hold, per granting unit. Data, not code —
/// the hardcoding rule applies: this is a live admin UI, not a constant.
model GrantDocumentRequirement {
  id             String            @id @default(cuid())
  grantingUnitId String?
  grantingUnit   GrantingUnit?     @relation(fields: [grantingUnitId], references: [id], onDelete: Cascade)
  kind           GrantDocumentKind
  /// pre_agreement | pre_disbursement | pre_closure
  stage          String
  isRequired     Boolean           @default(true)
  note           String?

  @@unique([grantingUnitId, kind, stage])
}
```

#### Invariants

1. An agreement reaches `executed` only with both signed-on dates, an
   `executedOn`, and an `agreement_executed` document attached.
2. `executedOn` must not precede `GrantDecision.decidedAt`. Warn, do not block —
   backdated paper is real; record it and flag it on the dashboard.
3. `GrantAgreementSignoff.approvedAt` is required before `sent_for_signature`.
4. Completeness is **derived**, never stored: `documentCompleteness(budgetId,
   stage)` in `lib/budget/documents.ts` joins requirements against documents.
   The same lesson as school-plan completeness — DB-driven, not template-driven.
5. `granteeVisible` is enforced server-side in the query, not filtered in the
   component. A grantee listing documents must never receive an internal row and
   hide it client-side.

#### Routes and UI

- `/budget/[id]/agreement` — status, signatories, signoff strip, documents.
- `/budget/[id]/documents` — the set, grouped by kind, with the completeness
  checklist and what is missing for the next stage.
- `/budget/documents` (partner-visible subtree) — the grantee's locker: their
  agreement, their reports, their UCs, and a slot to upload what is asked of them.
- `/settings/control-plane` — a new tab for `GrantDocumentRequirement`,
  alongside the eight that exist.
- Upload goes through the existing blob-upload seam, not a new one.

#### RBAC and middleware

`grant_agreement.read|create|update`, `grant_agreement.sign_off`,
`grant_document.read|create|delete`, `grant_document_requirement.update`.
Surfaces `budget.agreement`, `budget.documents`, `budget.document_locker`.
`partnerAllowedPath` gains `/budget/documents`, `/budget/[^/]+/agreement`
(read-only) and `/api/budget/[^/]+/documents/`.

#### Backfill

`scripts/backfill-grant-documents.ts` — point `GrantDocument` rows at existing
URLs rather than copying files: `declarationSignedScanUrl` →
`utilisation_certificate`, `bankStatementUrl` → `bank_statement`, review-portal
`source_chunks` document URLs → `dd_evidence` / `proposal` by their stored kind.
Leave the original columns in place; they become the legacy readers.

#### Done when

Every grant has an agreement row with a status; the next-stage gate can say
which document is missing; and a grantee can see their own agreement without a
staff member emailing it.

---

### 1.3 `Disbursement` — the funder side of the money

**The largest gap.** `BudgetReport.tranchesReceived` is a number the grantee
types; `lib/budget/grantAggregation.ts` can therefore only compute *approved vs
utilised*. "Released" exists nowhere.

Two answers from the team shape this section and should be read before the
models:

- **Accounting is the system of record for payments (Q4).** Pitstops *approves*
  a release; finance pays from the accounting system. `Disbursement` is
  therefore a **confirmation record**, not a ledger: it exists to say that an
  approved release was in fact paid, keyed on the bank reference, so the gap
  between approved and paid is visible. Pitstops must never be presented as the
  authority on a payment figure, and nothing here writes to a bank. The
  valuable screen is the gap, not the payment.
- **Tranches derive from the budget's per-year amounts, and later years are not
  fixed at approval (Q3).** Year 1 is committed at approval. Year 2+ is
  *indicative* until a year-boundary recompute restates it from year 1
  utilisation plus approved reallocations. A schedule that shows later years as
  committed money would report a pipeline that was never promised — the same
  class of error as reading a frozen baseline as live (D2).

#### Models

```prisma
enum TrancheFrequency {
  annual
  half_yearly
  quarterly
}

enum TrancheStatus {
  planned
  blocked          // a pre_tranche condition is open
  requested
  approved
  released
  partially_released
  cancelled
}

enum DisbursementStatus {
  pending
  released
  failed
  returned         // bounced back from the bank
  recovered        // clawed back from the grantee
}

/// The planned release schedule. Generated from the **budget's per-year
/// amounts** (not the agreement period) split across
/// `GrantAgreement.trancheFrequency`, then hand-adjustable. One row per
/// tranche. See Q3: only the current grant year is committed.
model GrantTranche {
  id       String @id @default(cuid())
  budgetId String
  budget   Budget @relation(fields: [budgetId], references: [id], onDelete: Cascade)

  trancheNumber Int
  grantYear     Int
  plannedOn     DateTime @db.Date
  plannedAmount Decimal  @db.Decimal(14, 2)
  status        TrancheStatus @default(planned)

  /// False until the year-boundary recompute confirms this year's figure
  /// (Q3). Year 1 is committed when the decision is approved; later years are
  /// indicative projections off the budget and MUST be rendered and
  /// aggregated as such. Nothing may be requested against an indicative
  /// tranche.
  isCommitted   Boolean  @default(false)
  committedAt   DateTime?
  /// What the figure was before the last restatement, kept so a changed
  /// projection can be explained. Null = never restated.
  restatedFromAmount Decimal? @db.Decimal(14, 2)
  restatedAt         DateTime?
  /// Why it moved: the utilisation shortfall and the reallocations applied.
  restatementNote    String?

  /// What must be true before this tranche may be released, beyond conditions:
  /// e.g. "report for slot 2 approved". Null = nothing extra.
  releaseRuleNote String?
  /// The report slot whose approval gates this tranche. The common real rule.
  gatingSlotId    String?
  gatingSlot      BudgetReportSlot? @relation(fields: [gatingSlotId], references: [id], onDelete: SetNull)

  requests      DisbursementRequest[]
  disbursements Disbursement[]

  @@unique([budgetId, trancheNumber])
  @@index([budgetId, grantYear])
  @@index([status, plannedOn])
}

enum DisbursementRequestStatus {
  draft
  submitted
  approved
  rejected
  cancelled
}

/// A request to release a tranche. Maker-checker: whoever submits may not
/// approve (enforced in requireAuthority, §2.2).
model DisbursementRequest {
  id         String       @id @default(cuid())
  trancheId  String
  tranche    GrantTranche @relation(fields: [trancheId], references: [id], onDelete: Cascade)

  requestedAmount Decimal @db.Decimal(14, 2)
  /// Snapshot of the gate state at submit time, so a later condition discharge
  /// does not rewrite why this was allowed through.
  gateSnapshot    Json    @default("{}")
  justification   String

  status      DisbursementRequestStatus @default(draft)
  submittedById String?
  submittedBy   User?    @relation("DisbursementRequester", fields: [submittedById], references: [id], onDelete: SetNull)
  submittedAt   DateTime?

  approvals   DisbursementApproval[]
  /// Required on rejected.
  rejectionNote String?
  resolvedAt    DateTime?

  @@index([trancheId])
  @@index([status, submittedAt])
}

/// One authority's sign-off on a request. Several rows where the DoA matrix
/// requires more than one (§2.2).
model DisbursementApproval {
  id        String              @id @default(cuid())
  requestId String
  request   DisbursementRequest @relation(fields: [requestId], references: [id], onDelete: Cascade)
  /// The DoA rule this approval satisfies. Plain id, no FK: the rule may be
  /// edited or retired later and this record must not change meaning.
  authorityRuleId String?
  /// Denormalised at approval time — what the matrix said when it mattered.
  authoritySnapshot Json @default("{}")

  approverId String
  approver   User     @relation("DisbursementApprover", fields: [approverId], references: [id], onDelete: Restrict)
  decision   String   // approve | reject
  note       String?
  decidedAt  DateTime @default(now())

  @@unique([requestId, approverId])
}

/// Confirmation that an approved release was paid. **Accounting is the system
/// of record (Q4)** — this row mirrors a payment made elsewhere so the
/// approved-vs-paid gap is visible here. Immutable except `status` and the
/// reconciliation columns.
model Disbursement {
  id        String       @id @default(cuid())
  trancheId String
  tranche   GrantTranche @relation(fields: [trancheId], references: [id], onDelete: Restrict)
  budgetId  String
  budget    Budget       @relation(fields: [budgetId], references: [id], onDelete: Restrict)
  requestId String?
  request   DisbursementRequest? @relation(fields: [requestId], references: [id], onDelete: SetNull)

  amount    Decimal  @db.Decimal(14, 2)
  /// Gross vs net: TDS or bank charges withheld at source (§2.3).
  tdsAmount Decimal  @db.Decimal(14, 2) @default(0)
  /// amount − tdsAmount. Stored, because this is what the bank actually moved
  /// and what the grantee reconciles against.
  netAmount Decimal  @db.Decimal(14, 2)

  valueDate DateTime @db.Date
  /// Bank reference — UTR / NEFT / cheque number. The reconciliation key.
  bankReference String?
  instrument    String?   // neft | rtgs | imps | cheque | other
  fromAccountLabel String?

  status    DisbursementStatus @default(pending)
  failureNote String?

  /// Reconciliation against what the grantee reports having received.
  /// Null until a report covering valueDate is approved.
  reconciledReportId String?
  reconciledReport   BudgetReport? @relation("DisbursementReconciliation", fields: [reconciledReportId], references: [id], onDelete: SetNull)
  reconciledAt       DateTime?
  /// Signed rupees: reported − released. Non-zero is a finding, not an error.
  reconciliationDelta Decimal? @db.Decimal(14, 2)

  recordedById String?
  recordedBy   User?    @relation("DisbursementRecorder", fields: [recordedById], references: [id], onDelete: SetNull)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  documents GrantDocument[]

  @@index([budgetId, valueDate])
  @@index([status, valueDate])
  @@index([bankReference])
}
```

#### Invariants

1. **Nothing releases without an executed agreement.** A `Disbursement` insert
   refuses unless `GrantAgreement.status = executed`.
2. **Conditions gate tranches, mechanically.** `releaseGate(trancheId)` returns
   blockers: open `pre_disbursement` conditions for tranche 1; open
   `pre_tranche` conditions whose `blocksTrancheNumber` matches; an unapproved
   `gatingSlot`; missing `pre_disbursement` documents. A request may be
   submitted while blocked (so the blockage is visible and chaseable) but
   cannot be **approved** while blocked. Overriding a blocker is a distinct
   permission and writes its own audit row.
3. `netAmount = amount − tdsAmount`, asserted on write.
4. Σ released per tranche ≤ `plannedAmount`; Σ across tranches ≤
   `GrantDecision.approvedAmount`. Hard refusal on the second — over-disbursing
   an approved grant is the error this whole model exists to prevent.
5. `TrancheStatus` is **derived from disbursements**, not set by hand, except
   `cancelled`. Recompute in the same transaction as the disbursement write
   (the `recurringPitstopTargetDate` lesson: a derived field maintained at write
   time, in one place).
6. A released disbursement is never deleted. Reversal is `status = returned` or
   a negative-amount `recovered` row, never an edit.
7. `tranchesReceived` on `BudgetReport` stays, and stops being the record: on
   report approval, compute `reconciliationDelta` for every disbursement whose
   `valueDate` falls in the slot period, and show the delta in the review panel.
8. **An indicative tranche cannot be requested against** (Q3). `isCommitted =
   false` refuses `submitDisbursementRequest` with a message naming the
   recompute that must run first. Every rollup, forecast and grantee-facing
   view must label indicative amounts; a figure that mixes committed and
   indicative money into one "committed" total is a defect, not a rounding
   choice.
9. **A recompute restates, it never silently overwrites.** Changing a tranche's
   `plannedAmount` moves the old value into `restatedFromAmount`, sets
   `restatementNote`, and writes an audit row (§2.1). A recompute of an
   already-committed tranche is refused — once committed, a change is an
   amendment, which goes through `GrantDecision` (D2).
10. **No payment is recorded without a bank reference** (Q4). `status =
    released` requires `bankReference`, because the reference is the only thing
    tying this row to the accounting system that actually owns it. A payment
    recorded here that accounting does not have is worse than no row at all.

#### Routes and actions

`app/(budget)/budget/disbursement-actions.ts`:
`generateTrancheSchedule()` (from the budget's per-year totals split across
`GrantAgreement.trancheFrequency`, on the `lib/budget-report-slots.ts` pattern
— build dates in **UTC**, per the cluster-day lesson; marks year 1 committed
and every later year indicative), `recomputeGrantYear(budgetId, grantYear)`
(reads year-1 utilisation from `grantAggregation.ts` plus approved
`BudgetReallocationRequest` rows, restates the year's indicative tranches and
commits them — run from the year-boundary cron and callable by hand),
`upsertTranche()`, `submitDisbursementRequest()`,
`approveDisbursementRequest()` (through `requireAuthority`),
`rejectDisbursementRequest()`, `recordDisbursement()`,
`markDisbursementFailed()`, `recordRecovery()`, `reconcileSlot()`.

`/api/budget/[id]/disbursements/export` — a payment file (CSV first; NACH/bank
format later) for the finance team, and `disbursement_advice` documents back.

`/api/budget/disbursements/import` — the other half of Q4: a CSV of paid
references out of the accounting system, matched to approved requests on
amount + date + reference. Unmatched rows are surfaced, never guessed at. This
is the path by which payments normally arrive; manual entry stays available for
one-offs.

#### UI

- `/budget/[id]/disbursements` — schedule, gate state per tranche with the
  blockers named, request/approve strip, payments with bank references,
  reconciliation column.
- `/budget/disbursements` — portfolio queue: requests awaiting approval, blocked
  tranches, overdue planned releases, unreconciled payments.
- `/budget/dashboard` — the section this unlocks: **committed / released /
  utilised**, undisbursed-commitment ageing, and a cash-flow forecast from
  `plannedOn` + `plannedAmount` across the portfolio.
- Grantee side, read-only: tranche schedule, what is blocking the next one, and
  payments with references so they can match their bank statement.

#### `grantAggregation.ts` changes

Add `released` to `GrantRow` and `Rollup`, alongside `approved` and `utilised`,
plus `committedNext` and `indicativeNext` as **separate** fields — never summed
into one figure (Q3, invariant 8).
Keep the existing header convention
comment honest — it currently states utilised = Σ reported actuals, which stays
true; add the released definition beside it (Σ `Disbursement.amount` where
`status = released`, gross not net, since net is a tax artefact).

#### Tests

- Release refused without an executed agreement.
- Approval refused while a `pre_tranche` condition is open; permitted after
  discharge; permitted-with-audit under override.
- Σ disbursed cannot exceed `approvedAmount`.
- `netAmount` assertion.
- Tranche status derivation across partial releases.
- Reconciliation delta signs correctly when the grantee reports more, and less,
  than was released.
- Schedule generation across a 30-month horizon with `partialPosition = "start"`,
  at each of the three frequencies, with the year totals matching the budget's.
- A request against an indicative year-2 tranche is refused.
- A recompute after an under-spent year 1 restates year 2 downward, keeps the
  prior figure in `restatedFromAmount`, and leaves an audit row.
- A recompute of a committed tranche is refused.
- `released` requires a bank reference.
- UTC date boundaries: a release planned 1 April does not land 31 March in IST.

#### Done when

The dashboard can state committed, released and utilised for any grant and the
whole portfolio, with indicative future years shown apart from committed money;
a tranche cannot be released past an open condition; the approved-but-unpaid
gap is visible; and a bank reference exists for every rupee the accounting
system says has left.

---

### 1.4 `GrantClosure` — the terminal state

`BudgetStatus` is `draft | final | approved` and a grant never ends.
`lib/budget/lapse.ts` reports unspent money as a sizing signal and nothing acts
on it.

#### Models

```prisma
enum GrantClosureStatus {
  not_started
  in_progress
  awaiting_refund
  closed
  closed_with_exception   // closed despite an unmet requirement, with a reason
}

enum GrantExitDecision {
  renew
  renew_reduced
  exit_planned
  exit_abrupt
  undecided
}

model GrantClosure {
  id       String @id @default(cuid())
  budgetId String @unique
  budget   Budget @relation(fields: [budgetId], references: [id], onDelete: Restrict)

  status GrantClosureStatus @default(not_started)

  /// The gates. Each derived where it can be, stored where a human must assert.
  finalReportSlotId String?
  finalReportSlot   BudgetReportSlot? @relation("ClosureFinalReport", fields: [finalReportSlotId], references: [id], onDelete: SetNull)
  finalUcReceivedAt DateTime?
  auditedAccountsReceivedAt DateTime?

  /// Money settlement.
  totalReleased    Decimal  @db.Decimal(14, 2) @default(0)
  totalUtilised    Decimal  @db.Decimal(14, 2) @default(0)
  /// released − utilised − carriedForward, floored at 0.
  unspentAmount    Decimal  @db.Decimal(14, 2) @default(0)
  /// How the unspent balance was settled. Decided case by case (Q5), so there
  /// is **no default and no inferred value**: where `unspentAmount > 0` this
  /// must be set by a person before closure can be signed off. A default here
  /// would quietly assert a financial position nobody took.
  settlementMode   String?  // refunded | adjusted_against_renewal | written_off | none
  /// Required when `settlementMode = adjusted_against_renewal`: the budget the
  /// balance was carried into. Without it a carry-forward is untraceable and
  /// the money appears twice across two grants.
  adjustedIntoBudgetId String?
  adjustedIntoBudget   Budget? @relation("ClosureAdjustment", fields: [adjustedIntoBudgetId], references: [id], onDelete: SetNull)
  refundReceivedOn DateTime? @db.Date
  refundAmount     Decimal? @db.Decimal(14, 2)
  refundReference  String?
  writeOffNote     String?

  /// Outstanding borrowings must be settled or explicitly carried.
  borrowingsSettled Boolean @default(false)

  exitDecision     GrantExitDecision @default(undecided)
  exitNote         String?
  /// The successor grant, where there is one.
  renewalBudgetId  String? @unique
  renewalBudget    Budget? @relation("ClosureRenewal", fields: [renewalBudgetId], references: [id], onDelete: SetNull)

  closedOn     DateTime? @db.Date
  closedById   String?
  closedBy     User?     @relation("GrantCloser", fields: [closedById], references: [id], onDelete: SetNull)
  exceptionNote String?

  assets   GrantAsset[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([status])
}

/// Capital items bought with grant money, and what happened to them at the end.
/// Seeded from the budget's capex lines; hand-edited thereafter.
model GrantAsset {
  id        String       @id @default(cuid())
  closureId String
  closure   GrantClosure @relation(fields: [closureId], references: [id], onDelete: Cascade)
  /// The capex line that funded it, where identifiable.
  budgetLineId String?
  budgetLine   BudgetLine? @relation(fields: [budgetLineId], references: [id], onDelete: SetNull)

  description String
  quantity    Int      @default(1)
  cost        Decimal  @db.Decimal(14, 2)
  acquiredOn  DateTime? @db.Date
  location    String?
  /// retained_by_grantee | transferred | returned | disposed | lost | unknown
  disposition String   @default("unknown")
  dispositionNote String?
  dispositionOn   DateTime? @db.Date

  @@index([closureId])
}
```

#### Invariants

1. `BudgetStatus` gains `closed`. Only `closeGrant()` sets it, and only with a
   `GrantClosure` at `closed` or `closed_with_exception`.
2. Closure refuses unless: every report slot is `approved` or explicitly waived;
   every `pre_closure` condition is `discharged` or `waived`; every
   `pre_closure` required document is present; `borrowingsSettled`;
   `unspentAmount` is zero or `settlementMode` is set (Q5 — chosen explicitly,
   never defaulted), and where that mode is `adjusted_against_renewal`,
   `adjustedIntoBudgetId` points at a real budget.
3. Any one of those unmet → `closed_with_exception` with a mandatory
   `exceptionNote`, and the exception is visible on the dashboard. Never a
   silent pass.
4. `totalReleased` / `totalUtilised` / `unspentAmount` are computed by
   `lib/budget/closure.ts` and **frozen into the row** at closure, not read live
   afterwards. The budget-cost-provenance lesson: a closed grant's numbers must
   not move when the registry or a later report changes.
5. A closed grant is read-only everywhere: no line edits, no report submission,
   no disbursement. One guard, `assertGrantOpen(budgetId)`, in the same seam as
   `withBudgetLineWrite`.
6. `lapse.ts` stays backward-looking and gains closure as an input: lapsed money
   on a closed grant is final, and `lapseFeedback.ts` can use it for renewal
   sizing with confidence it will not change.

#### Routes and UI

`closure-actions.ts`: `startClosure()` (seeds assets from capex lines),
`updateClosure()`, `recordRefund()`, `setExitDecision()`, `closeGrant()`,
`reopenClosure()` (distinct permission, audited).

- `/budget/[id]/closure` — the gate checklist with what is blocking, money
  settlement, asset register, exit decision.
- `/budget/closures` — portfolio: grants past `effectiveTo` with no closure
  started (the queue that matters), in-progress closures, awaiting refund,
  exceptions.
- `/budget/dashboard` — closed-grant cohort: lapse rate, exception rate, renewal
  rate by partner.

#### Cron

`/api/cron/grant-closure-nudges` — daily, on the `wiki-term-expiry` pattern
(`CRON_SECRET` bearer check, one-shot idempotency via a reminder log). Grants
within 30 days of `effectiveTo` nudge the grant lead to start closure; 60 days
past with no closure escalate. Reuse `BudgetReportReminderLog`'s per-recipient
keying shape in a `GrantClosureReminderLog`, so a re-run the same day is a
no-op.

**Note:** email is a dead end until a Resend sending domain is verified — every
send 403s and the SDK returns `{error}` rather than throwing. Build these on
in-app + push first, and treat email as the channel that lights up later.

#### Done when

A grant has an end; the portfolio can list grants that should have closed and
have not; and unspent money has a settlement mode on every closed grant.

---

## Phase 2 — Control

### 2.1 Audit the money (ships *before* Phase 1 — see D5)

`AuditLog` is called from ~56 files, **none** in `app/(budget)`,
`app/(review-portal)`, `app/api/approvals`, `app/api/budget`, `lib/budget`,
`lib/approvals` or `lib/review` — the one hit is `(review-portal)/layout.tsx`
logging portal access.

**No new model.** Extend the union in `lib/auditLog.ts`:

```ts
export type AuditEntityType =
  | …existing…
  | "Budget"              // the grant: lines, status, horizon, partner share
  | "BudgetLine"
  | "BudgetReport"        // submit, approve, send back, declaration
  | "BudgetReallocation"
  | "GrantPartner"        // registry edits, org relinking
  | "CostRegistry"        // rate changes that reprice future budgets
  | "GrantDecision"       // edits around an immutable decision (conditions)
  | "GrantAgreement"
  | "Disbursement"
  | "GrantClosure"
  | "Assembly"            // approvals wizard step locks, reopens
  | "DueDiligence";       // DD stage completion / reversal
```

Add `lib/budget/audit.ts` mirroring `lib/field/audit.ts`: thin helpers
(`auditBudgetLineDiff`, `auditReportTransition`, `auditAuthorityOverride`) so
call sites stay one line.

Call sites to cover, in priority order:

1. `report-actions.ts` — every transition: submit, approve, send back, reopen,
   reallocation resolve, `setReportConfig`.
2. `withBudgetLineWrite()` — the single seam every line write already passes
   through. One wrapper change audits all line edits, including grantee drafts.
3. Budget lifecycle: finalise, share to partner, partner submit, reopen,
   `partnerRound` bump, import, regenerate.
4. `lib/approvals/repo.ts` — `lockPartnerStep`, `reopenPartnerStep`,
   `freezeFinance`, `freezeBudget`, `lockJudgement`, `markRendered`,
   `markSubmittedToMeeting`. These already take `actorUserId`; they just do not
   record it outside the review DB.
5. DD stage completion in `/api/review/due-diligence/[orgId]`.
6. `CostRegistry` writes — `CostRegistryHistory` records the value change;
   `AuditLog` records who.

**Caveat worth stating in the PR:** this is forward-looking only. The
unaudited history is not recoverable, and the sooner it lands the smaller that
window is.

`/settings/audit` gains a grant filter (entity type + budget id + date range)
and a CSV export, so an auditor can be handed a trail without a DB query.

#### Done when

Every write in the grant modules produces a row naming the actor, and the audit
page can answer "who approved this report" and "who changed this approved line".

---

### 2.2 Delegation of authority

**Precondition (Q6): the matrix exists on paper.** That changes what this
section is. The schema below is the easy half; the deliverable is the *faithful
encoding* of the existing policy document, which must be read and transcribed
rule by rule before any of this is built — including the parts of it that are
ambiguous or that current practice quietly ignores. Where the paper and the
practice disagree, that is a decision for the team, surfaced, not resolved in
code. Seed the ruleset from that document in one reviewed migration and keep
the document's reference on every rule row, so a future reader can trace a
refusal back to the clause that caused it.

**What has to be extracted from that document before §2.2 starts.** One row per
rule, and every column filled — a blank is a question for the team, not a
default:

| Column | Meaning | If the document is silent |
|---|---|---|
| action | Which of the eight actions this clause governs | Ask. A clause that governs nothing is not a rule |
| holder | A role or a named person | Ask — "management" is not a holder |
| ceiling | Inclusive rupee limit, or unlimited | Ask. Never infer a ceiling from an example |
| approvers needed | 1, or 2 for maker-checker | Assume 1 and flag it: silence here is usually practice, not policy |
| submitter may approve? | Yes/no | Assume no. The stricter reading is the safe one to encode |
| scope | Granting unit, domain, or any | Assume any, and flag |
| clause ref | e.g. "Finance Policy v4 §6.2(b)" | Required — without it a refusal cannot be explained |

Three things to look for specifically, because they are what the schema cannot
guess and what practice most often diverges on: whether the ₹1 Cr board
threshold is on the **grant** or on the **annual outflow** (these differ for a
multi-year grant, and the difference decides which grants go to the board);
whether a *reallocation* within an approved budget needs the same authority as
the original approval or a lower one; and who may **waive a condition**, which
is the quietest way to approve money without appearing to.

Expect the document to be silent on at least one of the eight actions —
`gate_override` and `condition_waive` are usually absent from written policy
because the paper process has no mechanical gate to override. Those are new
decisions, and they are the team's to make, not mine to infer.

Today: `'gc'` / `'under_1cr'` only *labels* the rendered appraisal doc
(`lib/approvals/schema.ts:33`). Operationally, report approval and reallocation
approval gate on `isBudgetAdminOrSuperAdmin` — **any budget admin can approve
any amount.** No maker-checker, no segregation of duties, no delegation.

#### Models

```prisma
/// What a given role/person may approve, up to what amount, for which action.
/// Data, not code: a live admin UI under /settings/control-plane, not a constant.
model AuthorityRule {
  id String @id @default(cuid())

  /// The action being authorised. Closed vocabulary in lib/budget/authority.ts:
  /// grant_decision | budget_finalise | report_approve | reallocation_approve |
  /// disbursement_approve | condition_waive | closure_close | gate_override
  action String

  /// Scope. Null on either = any.
  grantingUnitId String?
  grantingUnit   GrantingUnit? @relation(fields: [grantingUnitId], references: [id], onDelete: Cascade)
  domain         String?

  /// Who holds it: a role, or a named person. Exactly one.
  roleId     String?
  role       Role?   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  userId     String?
  user       User?   @relation("AuthorityHolder", fields: [userId], references: [id], onDelete: Cascade)

  /// Inclusive rupee ceiling. Null = unlimited.
  maxAmount  Decimal? @db.Decimal(14, 2)
  /// How many distinct holders must approve. 2 = maker-checker at this level.
  approvalsRequired Int @default(1)
  /// When true, the submitter may not be one of the approvers.
  excludeSubmitter  Boolean @default(true)

  /// Lower number wins when several rules match.
  priority  Int      @default(100)
  isActive  Boolean  @default(true)
  note      String?
  /// The clause of the written DoA policy this rule encodes (Q6) — e.g.
  /// "Finance Policy v4 §6.2(b)". Carried onto every authoritySnapshot so a
  /// refusal can be traced to the paper that caused it.
  policyReference String?
  createdAt DateTime @default(now())

  @@index([action, isActive, priority])
}

/// Temporary transfer of someone's authority while they are away.
model AuthorityDelegation {
  id          String   @id @default(cuid())
  fromUserId  String
  fromUser    User     @relation("DelegationFrom", fields: [fromUserId], references: [id], onDelete: Cascade)
  toUserId    String
  toUser      User     @relation("DelegationTo", fields: [toUserId], references: [id], onDelete: Cascade)
  /// Null = all actions the delegator holds.
  action      String?
  /// A delegate may be capped below the delegator's own ceiling.
  maxAmount   Decimal? @db.Decimal(14, 2)
  fromDate    DateTime @db.Date
  toDate      DateTime @db.Date
  reason      String
  createdById String
  createdAt   DateTime @default(now())

  @@index([toUserId, fromDate, toDate])
}
```

#### The seam

```ts
// lib/budget/authority.ts
export type AuthorityCheck = {
  action: AuthorityAction;
  amount: number | null;         // null for non-amount actions
  grantingUnitId: string | null;
  domain: string | null;
  submitterId: string | null;    // for excludeSubmitter
  existingApproverIds: string[]; // for approvalsRequired
};

export type AuthorityVerdict =
  | { ok: true; rule: AuthorityRule; snapshot: Json; furtherApprovalsNeeded: number }
  | { ok: false; reason: "no_rule" | "over_ceiling" | "is_submitter" | "already_approved" | "delegation_expired"; detail: string };

export async function requireAuthority(session, check: AuthorityCheck): Promise<AuthorityVerdict>;
```

Rules: match on action, then scope (unit, domain), then holder (user beats
role), then ceiling; lowest `priority` wins; active delegations are folded in as
synthetic rules for the window. **No matching rule = refusal**, not a pass — the
opposite of the current implicit-allow, and the reason this needs a seeded
default ruleset shipped with the migration so nothing locks up on deploy.

Every verdict writes `authoritySnapshot` into the approval row (D4): what the
matrix said at the moment it mattered, so editing a rule later never changes
the meaning of a past approval.

#### Call sites to convert

`approveReport`, `resolveReallocationRequest`, `finaliseBudget`,
`recordDecision`, `waiveCondition`, `approveDisbursementRequest`,
`closeGrant`, `overrideReleaseGate`. Replace `isBudgetAdminOrSuperAdmin` on
each; keep it for *page* access (RBAC) where it belongs. D6 means these routes
already call the seam.

#### Fix alongside

The six budget server actions that still gate on creator while their pages are
admin-gated — the known "silent 500 Not found when an admin touches another's
budget" class. Converting them to `requireAuthority` + an explicit
`budgetAccess` check resolves both the control gap and the bug.

#### UI

`/settings/control-plane` → new "Authority" tab: the matrix as a grid
(action × scope × holder × ceiling), a delegation list, and a **"who can
approve this?"** simulator taking an action + amount + unit and listing the
holders. Without the simulator the matrix is unverifiable by the people who own
it.

#### Tests

A matrix fixture plus: ceiling boundary (exactly at `maxAmount` passes);
`excludeSubmitter`; `approvalsRequired = 2` needing two distinct holders; user
rule beating role rule; expired delegation refusing; no-rule refusing;
snapshot immutability after a rule edit.

#### Done when

No amount-bearing approval runs on `isBudgetAdminOrSuperAdmin`; a ₹2 Cr report
cannot be approved by someone capped at ₹25 L; and the matrix is editable
without a deploy.

---

### 2.3 Compliance calendar

DD captures 12A, 80G, FCRA and CSR-1 as point-in-time JSON in
`compliance_check` / `statutory_filings`; the approvals rulebook validates them
at appraisal. Nothing stores validity windows, and none of the 20 crons watches
them. A registration that lapsed mid-grant is invisible until someone opens the
DD page.

#### Models (main DB, keyed on `Org` — this is partner-level, not grant-level)

```prisma
enum ComplianceKind {
  registration_12a
  registration_80g
  fcra
  fcra_renewal
  csr1
  pan
  tan
  gst
  darpan
  audited_accounts
  annual_return
  other
}

enum ComplianceStatus {
  valid
  expiring_soon      // derived: within the kind's warn window
  expired
  not_applicable
  unknown
}

/// One registration or filing obligation for a partner org, with its window.
/// This is the row the cron watches.
model OrgCompliance {
  id    String @id @default(cuid())
  orgId String
  org   Org    @relation(fields: [orgId], references: [id], onDelete: Cascade)

  kind       ComplianceKind
  identifier String?          // registration / certificate number
  issuedOn   DateTime? @db.Date
  /// Null = perpetual (12A post-2020 re-registration aside; record what is true).
  validTo    DateTime? @db.Date
  /// For annual obligations: the next filing due date.
  nextDueOn  DateTime? @db.Date

  status     ComplianceStatus @default(unknown)
  /// Evidence. Points at the grant document set where a file exists.
  documentId String?
  document   GrantDocument? @relation(fields: [documentId], references: [id], onDelete: SetNull)

  /// Where this came from: dd_import | manual | grantee_upload
  source     String   @default("manual")
  verifiedById String?
  verifiedAt   DateTime?
  note       String?
  updatedAt  DateTime @updatedAt

  @@unique([orgId, kind])
  @@index([status, validTo])
  @@index([nextDueOn])
}

/// Warn windows per kind. Data, not constants.
model ComplianceKindConfig {
  kind          ComplianceKind @id
  warnDays      Int            @default(90)
  escalateDays  Int            @default(30)
  blocksRelease Boolean        @default(false)
  isActive      Boolean        @default(true)
}
```

#### Behaviour

- `status` is **derived and recomputed** by the cron, never hand-set except
  `not_applicable`. Deriving it live in every query would be cheaper but then
  "expiring_soon" could not be the thing a notification fires on exactly once.
- `/api/cron/compliance-expiry` — daily, `wiki-term-expiry` pattern:
  `CRON_SECRET` bearer check, recompute statuses, notify the grant lead and the
  grantee at `warnDays` and `escalateDays`, one-shot per (compliance, threshold)
  via a reminder log.
- **Release gate:** `ComplianceKindConfig.blocksRelease` feeds
  `releaseGate()` (§1.3). An expired FCRA on an FCRA-funded grant blocks the
  next tranche — which is the entire point, and is why this belongs in Phase 2
  rather than later.
- `lib/approvals/validation/rulebook.ts` reads `OrgCompliance` instead of
  re-deriving from DD JSON, so the appraisal and the calendar cannot disagree.

#### Backfill

`scripts/backfill-org-compliance.ts` — parse `compliance_check` /
`statutory_filings` JSON into rows. Expect it to be lossy: most rows will land
`unknown` with no `validTo`, because the dates were never captured. That is the
honest result, and the resulting "unknown" queue on `/budget/compliance` is the
work list for the team, not a bug in the script.

#### UI

`/budget/compliance` — by partner, worst status first; `unknown` queue called
out separately. `/budget/[id]` — a compliance strip for the grantee org, red
when a blocking registration is expired. Grantee locker: what is expiring and
where to upload the renewal.

#### 2.3b Statutory tax reporting

Separate PR, same phase, because it depends on `Disbursement`:

- **Form 10BD / 10BE** — donation statement + certificates. Build as an export
  over `Disbursement` grouped by grantee org and financial year, with the
  grantee's PAN from `OrgCompliance`. Validate PAN presence before export.
- **TDS on grants** — `Disbursement.tdsAmount` exists from §1.3. Add a rate
  field on `AuthorityRule`'s sibling config or on `GrantingUnit`, plus a
  quarterly TDS summary export.
- **CSR schedule** — an export of CSR-funded grants by implementing agency and
  project for the CSR-2 annexure, keyed on the `Fund` added in Phase 5. Until
  then, keyed on `GrantingUnit` with a note that it is an approximation.

All three are exports over data that will exist, not new write paths. Deliver
them as xlsx via the established `exportTemplate.ts` pattern.

---

### 2.4 Conflict of interest and negative-list screening

DD already stores the inputs on every board member — `PoliticalExposure` and
`RelatedPartyLink` (`lib/approvals/schema.ts`). They are rendered and never
screened. `ScreeningApplication.conflictUserIds` is the pattern, built for
fellowship applicants.

```prisma
/// A declared interest between a Pitstops user and a partner org. Blocks that
/// user from appraising, deciding or approving money for that org.
model ConflictDeclaration {
  id     String @id @default(cuid())
  userId String
  user   User   @relation("ConflictUser", fields: [userId], references: [id], onDelete: Cascade)
  orgId  String
  org    Org    @relation("ConflictOrg", fields: [orgId], references: [id], onDelete: Cascade)

  /// board_member | employment | family | financial | former_role | other
  nature      String
  description String
  declaredAt  DateTime  @default(now())
  /// Null = still live.
  endedOn     DateTime? @db.Date
  /// recuse (hard block) | disclose (allowed, recorded on the decision)
  treatment   String    @default("recuse")

  @@unique([userId, orgId, nature])
  @@index([orgId])
}

/// Names that must not receive funds, and names that need a second look.
model NegativeListEntry {
  id         String   @id @default(cuid())
  /// org | person
  subjectKind String
  name       String
  normalized String   @unique   // normalizePartnerName(), as OrgAlias does
  identifier String?            // PAN / registration no, where known
  /// deny (hard) | review (soft flag)
  severity   String   @default("review")
  sourceName String             // which list / who added it
  note       String?
  addedById  String?
  addedAt    DateTime @default(now())
  isActive   Boolean  @default(true)
}
```

#### Behaviour

- `requireAuthority` refuses when the actor holds a live `recuse` declaration
  for the grant's org. `disclose` passes and stamps the declaration id into
  `authoritySnapshot`, so the decision carries the disclosure.
- `GrantDecisionVote.vote = 'recused'` is pre-filled from declarations when a
  meeting's attendance is entered.
- Screening runs at three points: a new `Org`, an appraisal reaching the
  judgement step, and a disbursement request. It matches on `normalized` —
  reusing `normalizePartnerName()` from the alias registry, **a lookup table,
  not a fuzzy match**, for the same reason `OrgAlias` is: a near-match is a
  human judgement, and a resolved name must stay resolved.
- Board members from DD `governing_body` are screened too, by name — expect
  false positives and make dismissal a recorded act, not a silent one.

`/settings/negative-list` to maintain entries; `/budget/[id]` shows any hit
with its severity and who cleared it.

#### Done when

An appraiser with a declared interest cannot approve money for that org, and a
`deny` match blocks a new grant relationship.

---

## Phase 3 — Intake and pipeline

An organisation enters Pitstops only when a staff member creates an `Org` plus a
blank `org_due_diligence` row (`lib/partners/reviewMirror.ts:87`). There is no
call for proposals, no grantee-submitted concept note, no pipeline, and no
decline before appraisal.

**Build it on the screening module's bones.** `ScreeningApplication` already
solves: idempotent intake on a portal ref, structured answers + long-form text,
documents as JSON, a versioned rubric whose edits never change a recorded
total, two review levels with divergence routing, conflict recusal, and a full
`ScreeningEvent` audit trail. The grant side needs the same machine with orgs
instead of individuals. Do not fork the code — generalise where the shapes are
identical, and keep the models separate (a fellowship applicant and a grantee
org have genuinely different fields; one polymorphic table would be worse).

**Confirmed full scope (Q7): intake is a public open call**, not invitation
only. So everything in *Public intake* below stays in — the unauthenticated
form, rate limiting, BotID, magic-link resume, the `PUBLIC_PREFIXES` entry in
`middleware.ts`. This is the largest single item in the plan (6–8 weeks) and the
reason is the public surface, not the pipeline. Two things follow:

- The spam and abuse surface is real, and the existing screening portal is the
  evidence that it is survivable — reuse its defences rather than re-deciding
  them.
- Build the **pipeline half first and ship it** (staff-created proposals,
  stages, ageing, decline reasons, ~2–3 weeks), then the public form on top. The
  pipeline is what makes the public form useful; a public form with nowhere for
  submissions to go is worse than no form. This ordering also means an open call
  can be announced the moment the portal lands, rather than the portal waiting
  on pipeline work.

### Models

```prisma
enum FundingWindowStatus { draft open closed archived }

/// A call for proposals. Scoped to a granting unit, with its own form and rubric.
model FundingWindow {
  id             String  @id @default(cuid())
  name           String
  slug           String  @unique     // public URL
  grantingUnitId String?
  grantingUnit   GrantingUnit? @relation(fields: [grantingUnitId], references: [id], onDelete: SetNull)
  domains        String[] @default([])

  status    FundingWindowStatus @default(draft)
  opensOn   DateTime @db.Date
  closesOn  DateTime @db.Date
  /// Indicative envelope, for the applicant and for Phase 5's allocation check.
  budgetCeiling Decimal? @db.Decimal(14, 2)

  /// The application form as data: [{ key, label, type, required, help, options }].
  /// Live admin UI, not a constant in lib/.
  formSchema   Json @default("[]")
  /// Machine-checkable eligibility: [{ key, op, value, message }].
  eligibilityRules Json @default("[]")
  rubricId     String?
  rubric       ProposalRubric? @relation(fields: [rubricId], references: [id], onDelete: SetNull)

  guidance     String  @default("")
  isPublic     Boolean @default(false)
  createdAt    DateTime @default(now())

  proposals Proposal[]

  @@index([status, closesOn])
}

enum ProposalStage {
  draft              // applicant still editing
  submitted
  eligibility_failed
  screening
  screen_rejected
  concept_approved   // invited to full proposal
  full_submitted
  due_diligence
  appraisal          // an assembly exists
  decided            // a GrantDecision exists
  withdrawn
  lapsed             // went stale past the window
}

/// An application. Becomes a grant only by passing through DD and appraisal.
model Proposal {
  id       String        @id @default(cuid())
  windowId String?
  window   FundingWindow? @relation(fields: [windowId], references: [id], onDelete: SetNull)
  /// Intake idempotency key, as ScreeningApplication.ref does it.
  ref      String        @unique

  /// Resolved org, once identified. Null while the applicant is just a name:
  /// an unsolicited proposal must not mint an Org row before anyone has looked.
  orgId    String?
  org      Org?    @relation("ProposalOrg", fields: [orgId], references: [id], onDelete: SetNull)
  /// What the applicant typed. Resolved against OrgAlias at review time —
  /// the lookup table, never a fuzzy auto-link.
  applicantOrgName String
  contactName  String
  contactEmail String
  contactPhone String?

  title        String
  summary      String   @default("")
  requestedAmount Decimal? @db.Decimal(14, 2)
  requestedMonths Int?
  domains      String[] @default([])
  /// Geography the proposal is for, where it maps to ours.
  cityId       String?
  city         City?    @relation(fields: [cityId], references: [id], onDelete: SetNull)

  /// Structured answers keyed to the window's formSchema.
  answers      Json @default("{}")
  documents    Json @default("[]")
  /// Rules the form computed as failed: [{ key, message }].
  eligibilityFlags Json @default("[]")

  stage        ProposalStage @default(draft)
  /// Set on any rejection/withdrawal stage. Required there.
  outcomeReasonCode String?
  outcomeReasonNote String?

  /// Soft pointers forward. No FK on assemblyId (cross-DB, per D1).
  assemblyId   String?
  budgetId     String?  @unique
  budget       Budget?  @relation("ProposalBudget", fields: [budgetId], references: [id], onDelete: SetNull)

  ownerUserId  String?
  ownerUser    User?    @relation("ProposalOwner", fields: [ownerUserId], references: [id], onDelete: SetNull)
  conflictUserIds String[] @default([])

  submittedAt DateTime?
  stageEnteredAt DateTime @default(now())   // for ageing
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  reviews ProposalReview[]
  events  ProposalEvent[]

  @@index([stage, stageEnteredAt])
  @@index([windowId, stage])
  @@index([orgId])
}

/// Scored read of a proposal. Freezes its rubric, exactly as ScreeningReview does.
model ProposalReview {
  id         String   @id @default(cuid())
  proposalId String
  proposal   Proposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  level      String   // screen | deep
  reviewerId String?
  reviewer   User?    @relation("ProposalReviewer", fields: [reviewerId], references: [id], onDelete: SetNull)
  scores     Json
  total      Float?
  /// The rubric as it stood when this review was made.
  rubric     Json
  decision   String   // advance | hold | reject
  justification String
  createdAt  DateTime @default(now())

  @@index([proposalId])
}

model ProposalRubric {
  id         String   @id @default(cuid())
  key        String   @unique
  version    Int      @default(1)
  dimensions Json     // same shape as ScreeningRubric.dimensions
  guidance   String   @default("")
  advanceMin Int      @default(70)
  holdMin    Int      @default(50)
  updatedAt  DateTime @updatedAt

  windows FundingWindow[]
}

/// Audit trail: submissions, stage moves, flags, reopens, rubric changes.
model ProposalEvent {
  id         String    @id @default(cuid())
  proposalId String?
  proposal   Proposal? @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  actorId    String?
  actor      User?     @relation("ProposalEventActor", fields: [actorId], references: [id], onDelete: SetNull)
  type       String
  detail     Json?
  createdAt  DateTime  @default(now())

  @@index([proposalId, createdAt])
}
```

### Invariants

1. A proposal never writes an `Org`. **Promotion is explicit:** a reviewer
   either links an existing org (via `OrgAlias` lookup, adding the applicant's
   spelling as a new alias) or creates one. Auto-creating orgs from a public
   form would wreck the registry that was just consolidated.
2. Stage transitions are a closed graph in `lib/proposals/stages.ts`. No
   arbitrary jumps; every move writes a `ProposalEvent`.
3. Any terminal rejection stage requires `outcomeReasonCode`. Decline-rate
   analysis is the point.
4. `stageEnteredAt` resets on every move — pipeline ageing reads it.
5. `budgetId` is set when a budget is created *from* the proposal, carrying
   `requestedAmount`, `domains`, `requestedMonths` → `horizonMonths` as the
   starting shape.
6. `Proposal.stage = decided` is derived from a `GrantDecision` existing on the
   linked budget — not set by hand.
7. A conflicted reviewer never sees the proposal again, as screening does it.

### Public intake

A public form, which means `middleware.ts` `PUBLIC_PREFIXES` gains
`/apply/`. Build the form as a Next.js route under `app/(public)/apply/[slug]`,
**not** a static `public/` page — it needs server validation and a DB write,
unlike the training hubs.

Hard requirements, because this is the app's first unauthenticated write path:
- Rate limit per IP and per email; BotID or an equivalent check before insert.
- A magic-link resume token so an applicant can finish a draft later. Reuse
  `PasswordResetToken`'s shape; do not invent a second token model.
- Server-side file-type and size validation on uploads; store via the existing
  blob seam, never trust the client's `mimeType`.
- Server-owned `ref`. The applicant never supplies or sees a mintable
  identifier — the identity-field rule, which a `/recruitment` incident already
  taught the hard way.
- No eligibility *decision* client-side. The form may hint; the server computes
  `eligibilityFlags`.
- Submission confirmation is in-app on the page itself. Email confirmation is
  queued and will deliver once a Resend sending domain is verified.

### Internal UI

- `/proposals` — pipeline board by stage, with ageing and a per-stage count.
  The page that answers "what is in front of us".
- `/proposals/[id]` — the application, eligibility flags, scored reviews,
  org-resolution control, stage actions, event log.
- `/proposals/windows` + `/windows/[id]` — window config, form builder, rubric,
  eligibility rules, applicant list, close-the-window action.
- `/budget/dashboard` — pipeline section: proposals by stage, conversion rate
  window → decision, decline reasons, median days per stage.

### Cron

`/api/cron/proposal-lapse` — daily. Windows past `closesOn` flip to `closed`;
drafts never submitted go `lapsed`; proposals ageing past a per-stage threshold
nudge their owner. Same `CRON_SECRET` + one-shot-log pattern.

### Done when

An org can apply without a staff member creating it first; every proposal has a
stage, an owner and an age; a decline has a recorded reason; and a proposal can
become a budget without re-typing what was already submitted.

---

## Phase 4 — Results: join grants to delivery

`Goal` has no grant reference. Operations, field visits, indicators, caregiver
practices and the wiki all hang off **geography + partner org**, so "what did
this grant buy" is answered by a human inferring it from partner + place.

Reporting slots are financial only: lines, bank position, FD details. No
narrative, no logframe, no indicator targets per period.

### 4.1 The join

```prisma
model Goal {
  /// The grant funding this work. Nullable forever: plenty of goals are
  /// in-house and funded by nobody in particular.
  fundingBudgetId String?
  fundingBudget   Budget? @relation("GoalFunding", fields: [fundingBudgetId], references: [id], onDelete: SetNull)
  /// What share of this goal this grant funds, 0–100. Required whenever
  /// fundingBudgetId is set — asserted in code, since Prisma cannot express a
  /// conditional NOT NULL. A silent default of 100 would make every
  /// cost-per-outcome figure quietly wrong on co-funded work.
  fundingSharePct Float?
}

model ActionPoint {
  /// Set when the action point arises from grant monitoring rather than a visit.
  fundingBudgetId String?
  fundingBudget   Budget? @relation("ActionPointFunding", fields: [fundingBudgetId], references: [id], onDelete: SetNull)
}

model Risk {
  /// Grant-level risk. Coexists with goalId/pitstopId; at most one is set.
  budgetId String?
  budget   Budget? @relation(fields: [budgetId], references: [id], onDelete: SetNull)
  /// Where an appraisal risk graduated into the live register.
  sourceDecisionId String?
  /// Mirrors lib/approvals/schema.ts RiskCategory.
  category String?
  /// Review rhythm: the register is only real if someone revisits it.
  reviewDueOn DateTime? @db.Date
  lastReviewedOn DateTime? @db.Date
}
```

**Why a nullable column and not a join table:** a goal is funded by at most one
grant in practice, and co-funding is better modelled as two goals than as a
split row. If co-funding turns out to be common, promote to
`GoalFunding(goalId, budgetId, sharePct)` — the `fundingSharePct` column is the
forward-compatible hook.

**Backfill is a judgement call, not a script.** Candidate matches by partner org
+ geography + overlapping dates are *suggestions*; a staff member confirms each.
`scripts/suggest-goal-funding.ts` writes a review CSV; the confirmation happens
in a UI with a "not funded by a grant" option. Auto-assigning would manufacture
attribution that reads as fact — the same failure as agreeing with a misspelt
partner name because three copies of the app agreed with each other.

### 4.2 Narrative and indicator reporting per slot

```prisma
/// The results framework for one grant: what it promised to move.
/// Seeded from the appraisal's PddGoal / MeasurableOutcome / PddEffect, which
/// already capture exactly this and currently die at the rendered note.
model GrantResult {
  id       String @id @default(cuid())
  budgetId String
  budget   Budget @relation(fields: [budgetId], references: [id], onDelete: Cascade)

  sortOrder Int    @default(0)
  /// output | outcome | effect — the appraisal's own vocabulary.
  level     String
  statement String
  /// Where the number comes from, when it is automatable.
  metricId          String?
  metric            GoalMetric?          @relation(fields: [metricId], references: [id], onDelete: SetNull)
  facilityIndicatorDefId String?
  facilityIndicatorDef   FacilityIndicatorDef? @relation(fields: [facilityIndicatorDefId], references: [id], onDelete: SetNull)
  unit      String?
  baseline  Float?
  /// Targets per grant year: { "1": 1200, "2": 1500 }.
  targets   Json    @default("{}")
  /// Null = manual entry each period.
  isDerived Boolean @default(false)

  periodValues GrantResultValue[]

  @@index([budgetId, sortOrder])
}

/// The value for one result in one reporting slot.
model GrantResultValue {
  id       String @id @default(cuid())
  resultId String
  result   GrantResult @relation(fields: [resultId], references: [id], onDelete: Cascade)
  slotId   String
  slot     BudgetReportSlot @relation(fields: [slotId], references: [id], onDelete: Cascade)

  value      Float?
  /// derived | grantee | staff
  source     String   @default("grantee")
  note       String?
  /// Set when a reviewer disputes the grantee's figure. Both are kept.
  reviewerValue Float?
  reviewerNote  String?
  updatedAt  DateTime @updatedAt

  @@unique([resultId, slotId])
}

/// The narrative half of a report. Sections as data so the template can change
/// per granting unit without a deploy.
model BudgetReportNarrative {
  id       String       @id @default(cuid())
  reportId String       @unique
  report   BudgetReport @relation(fields: [reportId], references: [id], onDelete: Cascade)
  /// [{ key, heading, body }] against a template on GrantingUnit.
  sections Json         @default("[]")
  /// Grantee-reported challenges and changes — the part funders actually read.
  deviationsNote String?
  submittedAt DateTime?
  updatedAt   DateTime @updatedAt
}
```

### Behaviour

- A report slot's completeness becomes financial **and** narrative **and**
  results. `ReportSlotStatus` is unchanged; the gate on submit widens, and
  which parts are required is a per-granting-unit config (same pattern as
  `GrantDocumentRequirement`).
- `isDerived` results compute from `MetricDataPoint` / `FacilityIndicatorPoint`
  over the slot period, through the goals joined by §4.1. The grantee sees the
  derived number and may annotate it, not overwrite it.
- Appraisal risks graduate: `recordDecision` copies `RiskEntry` rows into
  `Risk` with `budgetId` and `sourceDecisionId` set and a `reviewDueOn`. This is
  what turns the appraisal's risk list into a register.
- Monitoring visits: reuse `FieldVisit` rather than adding a model, with a
  visit-step template for grant monitoring and `ActionPoint.fundingBudgetId`
  carrying findings. Corrective actions then land in the same tracker staff
  already use.

### UI

- `/budget/[id]/results` — framework, targets vs actuals by period, trend.
- `/budget/[id]/reports/[slotId]` — a narrative tab and a results tab beside
  the financial form, for both grantee and reviewer.
- `/budget/[id]` — a delivery strip: goals funded, visits done, open action
  points, open risks.
- `/effects` — grant attribution added to the existing impact layer.
- Cost-per-outcome on the dashboard, and on the appraisal's comparables table:
  this is what makes `beneficiariesPerYear` more than a divisor.

### Done when

A grant can show what it promised, what was delivered, and what it cost per
unit of that — without a human joining it up by hand.

---

## Phase 5 — Consolidation

### 5.1 Funds and donor sources — **cut** (Q8)

**Do not build this.** There is a single funder, so there is no restricted
corpus to track, no envelope to breach, and no donor-restricted report anyone
can ask for. The models below are kept only as a record of what the shape would
be if a second funder ever appears; nothing in Phases 1–4 depends on them.

What is worth keeping from this section is one view, not a schema: **approved
versus the granting unit's own allocation**, so a decision cannot be taken past
what the unit has to give. That is a sum over `GrantDecision.approvedAmount`
against a number on `GrantingUnit`, and it belongs in §2.2's refusal path, not
here.

The original problem statement follows, unchanged, for whoever revisits it:

There is no `Fund` / `DonorSource`. Money going out is visible; which restricted
corpus, CSR donor or endowment it came from is not, so donor-restricted
reporting is impossible and the CSR annexure of §2.3b is an approximation.

```prisma
enum FundKind { corpus endowment csr_donation grant_in institutional retail other }

/// Where money comes from. The other half of the ledger.
model Fund {
  id       String   @id @default(cuid())
  name     String   @unique
  kind     FundKind
  /// The donor, where it is an organisation we already know.
  donorOrgId String?
  donorOrg   Org?    @relation("FundDonor", fields: [donorOrgId], references: [id], onDelete: SetNull)
  currency String   @default("INR")

  /// Restrictions that constrain what it may fund. Checked at commitment.
  restrictedToDomains  String[] @default([])
  restrictedToCities   String[] @default([])
  /// Window within which it must be spent.
  availableFrom DateTime? @db.Date
  mustSpendBy   DateTime? @db.Date
  /// Donor reporting obligations, as a schedule to be surfaced, not enforced.
  reportingNote String?

  isActive Boolean @default(true)
  receipts FundReceipt[]
  allocations FundAllocation[]
  createdAt DateTime @default(now())
}

/// Money in.
model FundReceipt {
  id        String   @id @default(cuid())
  fundId    String
  fund      Fund     @relation(fields: [fundId], references: [id], onDelete: Restrict)
  amount    Decimal  @db.Decimal(14, 2)
  currency  String   @default("INR")
  /// Rate to INR on valueDate, 1 for INR. Frozen: never recomputed.
  fxRate    Decimal  @db.Decimal(12, 6) @default(1)
  amountInr Decimal  @db.Decimal(14, 2)
  valueDate DateTime @db.Date
  bankReference String?
  note      String?
  createdAt DateTime @default(now())

  @@index([fundId, valueDate])
}

/// The envelope: how much of a fund a granting unit may commit in a period.
model FundAllocation {
  id             String @id @default(cuid())
  fundId         String
  fund           Fund   @relation(fields: [fundId], references: [id], onDelete: Cascade)
  grantingUnitId String
  grantingUnit   GrantingUnit @relation(fields: [grantingUnitId], references: [id], onDelete: Cascade)
  /// Financial year label, e.g. "2026-27".
  financialYear  String
  amount         Decimal @db.Decimal(14, 2)
  note           String?

  @@unique([fundId, grantingUnitId, financialYear])
}

model Budget {
  /// Which fund this grant is committed against. Null on legacy rows.
  fundId String?
  fund   Fund?  @relation(fields: [fundId], references: [id], onDelete: SetNull)
}
```

**Commitment control (the encumbrance the audit found missing):**
`fundPosition(fundId, grantingUnitId, financialYear)` returns
allocated − committed − released, where committed = Σ `approvedAmount` of live
decisions against that fund. `recordDecision` refuses — or warns loudly, a
configurable per-unit choice — when it would over-commit, and refuses outright
when the fund's domain or city restriction does not cover the grant. Nothing
else can catch over-commitment before the fact.

### 5.2 Multi-currency

Today every `currency` occurrence is `Intl.NumberFormat` formatting; INR is
assumed throughout.

```prisma
/// Rates to INR, per day. Append-only; a stored rate is never recomputed.
model FxRate {
  id       String   @id @default(cuid())
  currency String
  onDate   DateTime @db.Date
  rateToInr Decimal @db.Decimal(12, 6)
  source   String   @default("manual")
  createdAt DateTime @default(now())

  @@unique([currency, onDate])
}
```

Rule: **transaction currency plus a frozen INR equivalent at transaction date.**
Every amount-bearing row gains `currency` + `fxRate` + `amountInr`, computed
once on write and never revalued — the same discipline as `costSnapshot` and
`CostRegistryHistory`. Reporting is always in INR; the transaction currency is
shown beside it. No live revaluation anywhere, because a grant's approved amount
must not drift with the exchange rate.

Scope this to `FundReceipt` and `Disbursement` first. Budget lines in foreign
currency are a much larger change (the whole generator and export assume INR)
and should wait for a real need.

### 5.3 The two-database decision

Appraisals and DD live in `REVIEW_DATABASE_URL` as raw
`@neondatabase/serverless` SQL; budgets, partners and reporting live in the main
Prisma DB. Bridged by `lib/partners/reviewMirror.ts` and
`lib/review/budget-bridge.ts`, with `assessment_assemblies.budget_id` as a soft
pointer. No referential integrity, no cross-DB transaction, no consistency
check.

Three options, with a recommendation:

| | Effort | Result |
|---|---|---|
| **A. Migrate the review DB into the main Prisma DB** | High — 20-odd tables, ~30 frozen orchestrator notes, every raw SQL call site rewritten | One boundary, real FKs, transactions. The correct end state. |
| **B. Keep both, add a tested sync contract** | Medium | Explicit `lib/review/bridge/` with typed read/write functions, a reconciliation cron that reports drift, and tests. Integrity still advisory. |
| **C. Leave as is** | None | Drift stays invisible until someone notices a grant with two appraisals. |

**Recommend B now, A when the frozen corpus is migrated anyway.** B is a
precondition for A (it builds the inventory of every crossing), and it delivers
the reconciliation job that Phase 1's D1 best-effort bridge already depends on.
Doing A first means rewriting call sites twice.

The reconciliation cron (`/api/cron/review-reconcile`, daily) reports: assemblies
whose `budget_id` points at a missing budget; budgets whose decision names a
missing assembly; orgs in one DB and not the other; assemblies at `submitted`
with a decision recorded, and vice versa. Report, never auto-repair.

### 5.4 Migrate the frozen corpus

~30 notes from the LLM orchestrator (`grant_notes` + `grant_note_sections`)
remain readable but unmigrated alongside the wizard's `assessment_*` tables, so
portfolio queries over history must handle both shapes.

Migrate to a **read-only archive**, not to live assemblies: a
`GrantNoteArchive` row per note holding the rendered content, the org link (via
`OrgAlias`, resolved — 25 of 33 already are), the decision it supported, and the
original sections as JSON. They were composed by an LLM against a different
rulebook; promoting them to first-class assemblies would imply they passed
validations they never saw. Link them from the partner's grant history so the
record is complete, and let the portfolio queries read one shape.

### 5.5 External integrations

In dependency order, each a separate PR:

1. **E-signature** on `GrantAgreement` — the highest-value one, because it
   removes the only manual step in Phase 1's chain. Provider-agnostic: a
   `signatureProvider` + `envelopeId` + webhook that flips `executed` and
   attaches the signed PDF as an `agreement_executed` document.
2. **Accounting bridge** (Tally / Zoho Books / ERPNext) — export-first. A
   voucher export over `Disbursement` with cost-centre mapping per
   `GrantingUnit`, and a reconciliation import that matches on `bankReference`.
   Do not attempt two-way sync; a one-way export plus a matching import covers
   the real workflow and cannot corrupt the ledger.
3. **Bank statement ingest** — generalise `bankStatementParsed` from per-report
   parsing to a statement-level import that auto-reconciles `Disbursement` rows
   on `bankReference`.
4. **Email** — blocked at the root: no Resend sending domain is verified, so
   every send 403s and the SDK returns `{error}` instead of throwing. **Verify a
   sending domain before building any email-dependent flow.** Until then, every
   notification path above is in-app + push, which is why they were specified
   that way.
5. **MIS / funder portals** — `MISProviderConfig` + `MISProviderSyncLog` already
   exist for indicator sync and are the right precedent if a funder ever wants a
   feed.

---

## Appendix A — Dependency graph

```
2.1 audit  ──────────────────────────────────────────────┐
                                                         │
1.1 decision ──► 1.2 agreement ──► 1.3 disbursement ──► 1.4 closure
      │                │                   │                 │
      │                │                   ├──► 2.2 DoA ◄────┤
      │                │                   │
      │                └──► 2.3 compliance ┘ (blocksRelease)
      │                          │
      │                          └──► 2.3b 10BD / TDS / CSR
      │
      ├──► 2.4 COI (needs requireAuthority from 2.2)
      │
      ├──► 3 intake ──► (Proposal.budgetId → 1.1)
      │
      ├──► 4.1 goal join ──► 4.2 results per slot
      │
      └──► 5.1 funds ──► 5.2 currency
                │
                └──► 2.3b CSR becomes exact

5.3 DB contract  — independent, do early (D1 depends on it)
5.4 corpus       — independent
5.5 integrations — after 1.2 (e-sign) and 1.3 (accounting)
```

Hard orderings: 2.1 before 1.1 (D5). 1.2 before 1.3 (no release without an
executed agreement). 1.3 before 1.4 (closure settles released money). 2.2 before
2.4 (COI rides the authority seam).

Everything else can run in parallel by team.

## Appendix B — Summary of schema additions

| Phase | New models | Changed models |
|---|---|---|
| 1.1 | `GrantDecision` (incl. `budgetSnapshot`), `GrantCondition`, `GrantDecisionVote`, `GrantMeeting` | — |
| 1.2 | `GrantAgreement`, `GrantAgreementSignoff`, `GrantDocument`, `GrantDocumentRequirement` | — |
| 1.3 | `GrantTranche`, `DisbursementRequest`, `DisbursementApproval`, `Disbursement`, enum `TrancheFrequency` | `BudgetReport` (reconciliation back-relation), `GrantAgreement` (+`trancheFrequency`) |
| 1.4 | `GrantClosure` (incl. `adjustedIntoBudgetId`), `GrantAsset`, `GrantClosureReminderLog` | `BudgetStatus` (+`closed`), `Budget` (closure-adjustment back-relation) |
| D3 | — | **every money column → `Decimal(14,2)`** (Q1) |
| 2.1 | — | `AuditEntityType` union |
| 2.2 | `AuthorityRule` (incl. `policyReference`), `AuthorityDelegation` | — |
| 2.3 | `OrgCompliance`, `ComplianceKindConfig` | — |
| 2.4 | `ConflictDeclaration`, `NegativeListEntry` | — |
| 3 | `FundingWindow`, `Proposal`, `ProposalReview`, `ProposalRubric`, `ProposalEvent` | `middleware.ts` `PUBLIC_PREFIXES` |
| 4 | `GrantResult`, `GrantResultValue`, `BudgetReportNarrative` | `Goal`, `ActionPoint`, `Risk` |
| 5 | ~~`Fund`, `FundReceipt`, `FundAllocation`~~ (cut, Q8), `FxRate`, `GrantNoteArchive` | ~~`Budget` (+`fundId`)~~ |

Roughly 27 new models after the Q8 cut. Every addition is additive and the only
enum widenings are `BudgetStatus` (+`closed`), `WizardStep` (+`decision`) and
`AuditEntityType` — **except** the D3 money-type sweep, which is the one
genuinely non-additive change in this document and the reason it gets its own
slot and its own Neon-branch rehearsal.

## Appendix C — Recurring traps this spec is written against

Drawn from what has already gone wrong in this codebase. Each one has a line in
the spec above that exists because of it.

- **No hardcoding.** Document requirements, authority rules, compliance windows,
  form schemas, rubrics and narrative templates are all live admin UIs, not
  constants in `lib/`. `GoalTemplateDef` over `lib/templates.ts` is the
  precedent.
- **Identity fields are server-owned.** `Proposal.ref`, `GrantDecision` ids,
  disbursement references. The applicant never mints one.
- **Derived values are maintained at write time, in one place.**
  `TrancheStatus`, `GrantClosure` totals, compliance `status` — the
  `recurringPitstopTargetDate` discipline.
- **Frozen snapshots never revalue.** `authoritySnapshot`, `gateSnapshot`,
  closure totals, `fxRate`, review rubrics. The
  `export-overrides-with-live-registry` bug in reverse.
- **Dates in UTC, compared in UTC.** Tranche schedules, closure windows, cron
  boundaries. Never `iso.slice(0,10)` for "is today".
- **A bare `fetch()` sends no `X-Surface`** and silently 403s for non-admins
  while admins sail through. Every new client call uses `fetchJson()`.
- **A selective grant needs the RBAC row *and* the middleware entry.** Both are
  listed for each phase; one without the other redirects silently.
- **Seed roles with `scripts/seed-role.ts`**, never `seed-rbac.ts`, and
  dry-run the diff — `seedRole()` deletes and recreates a role's grants.
- **`.env.local` is production Neon.** Every backfill script here is dry-run by
  default and takes an explicit `--apply`.
- **`NOT: { field: { gte, lte } }` silently drops NULL rows.** Relevant to every
  "no decision yet" / "not closed" / "no compliance record" query in this spec.
- **Agreement between two copies of the same data is not evidence.** Why §4.1's
  backfill suggests and a human confirms, and why §5.3's reconciliation reports
  rather than repairs.

## Appendix E — Sizing, and what to cut

Rough sizing for sequencing, not estimation. "Weeks" assumes one developer who
knows this codebase, including migration, backfill, tests and the admin UI.

| Item | Weeks | Value if built | Cost if skipped |
|---|---|---|---|
| 2.1 audit call sites | 1–2 | Low on its own | Compounds daily. The only item whose cost **grows while you wait**. |
| D3 `Decimal` sweep | 2–3 | Removes a class of silent mismatch | Cost grows with every new money row |
| 1.1 decision + conditions | 3–4 | Very high | Conditional approvals stay untracked; no decision of record |
| 1.2 agreement + documents | 3–4 | High | Documents stay in five places; no stage gate |
| 1.3 disbursement | 4–6 | Very high | "Released" stays unknowable; no cash forecast |
| 1.4 closure | 2–3 | Medium-high | Grants never end; lapse stays un-actioned |
| 2.2 delegation of authority | 2–3 | High (control) | Any budget admin approves any amount |
| 2.3 compliance calendar | 2–3 | High | Expired registrations stay invisible |
| 2.3b 10BD / TDS / CSR | 2–3 | Statutory | Manual spreadsheet work each year |
| 2.4 COI + negative list | 1–2 | Low–medium at this scale | See below |
| 3 pipeline half (staff-created) | 2–3 | High | No pipeline, no decline-before-appraisal |
| 3 public portal on top | 4–5 | Required — intake is an open call (Q7) | No open call possible |
| 4.1 goal↔grant join | 2–3 | High | No grant-level delivery story |
| 4.2 results + narrative | 4–5 | High | Reporting stays financial-only |
| ~~5.1 funds + envelope~~ | **cut** | Single funder (Q8) | Keep only the granting-unit allocation check, inside §2.2 |
| 5.2 multi-currency | 2–3 | Only if non-INR money exists | — |
| 5.3 DB sync contract (option B) | 2–3 | Medium | Drift stays invisible |
| 5.4 frozen corpus archive | 1–2 | Low–medium | Portfolio history handles two shapes |
| 5.5 e-sign | 1–2 | High (removes the manual step) | Paper round-trip stays |
| 5.5 accounting export | 2–3 | High | Double entry by hand |

Full build: roughly **44–62 developer-weeks** after the team's answers (§5.1
cut, §1.3 lighter now that accounting is the record, the `Decimal` sweep added).
Still a year of one person, and the reason the phases are ordered by what
unblocks the most rather than by size.

### What is still worth questioning

Two of the original three are now settled: **§3 stays** at full scope (Q7 — it
is an open call), and **§5.1 is cut** (Q8 — single funder). What remains:

**§2.4 negative list (1–2 weeks).** At 33 partners, a screening engine with
normalised matching is probably over-built; a reviewed list and a checkbox on
the appraisal would do. The `ConflictDeclaration` half is worth keeping — it
rides the authority seam and genuinely prevents something, and now that the DoA
matrix is a real policy document (Q6) a recusal rule has somewhere to come
from. The `NegativeListEntry` half can wait until there is a list long enough
to need matching.

**§5.2 multi-currency (2–3 weeks).** Specced because the audit found INR
hardcoded, but nothing observed suggests foreign-currency money actually
exists here, and Q8's single funder makes it less likely still. Build it when a
non-INR receipt appears, not before.

**The §3 public portal, specifically its ongoing cost.** The decision to build
it is made, but it is worth separating the 2–3 week pipeline from the 4–5 week
portal and shipping them apart. A public form is not a one-off cost: it is spam,
abandoned drafts, applicants who need support, and a queue someone has to keep
clearing. That running cost is the part to be sure about, not the build.

### The one item not to defer

**§2.1, now joined by the D3 `Decimal` sweep.** Everything else can wait; these
two are the only costs that accrue while you wait — the unaudited window is
permanent, and every money row written as `Float` is one more row to migrate
later. §2.1 is one to two weeks with no migration beyond a type union; the sweep
is two to three and is the riskiest migration here, which is exactly why it
should happen while the money tables are as small as they will ever be. If only
one thing ships from this document, ship §2.1.

## Appendix D — Answers from the team (11 November 2026)

All eight resolved. Each answer is written into its own section; this table is
the index, not the detail.

| # | Question | Answer | Where it landed |
|---|---|---|---|
| 1 | Sweep `Float` money columns to `Decimal`? | **Sweep everything** | D3 rewritten: one typed migration, lands with §2.1, 2–3 weeks of its own |
| 2 | Deferral — same assembly or new? | **Same one, re-presented** | §1.1 invariant 4a: `supersedesId` chain + a distinct `deferred` assembly state so ageing is honest |
| 3 | Tranche schedules — generated or hand-built? | **Derived from the budget's per-year amounts; annual by default, quarterly/half-yearly for creche and urban ops; year 2+ restated from year 1 utilisation and reallocations** | §1.3 reworked: `TrancheFrequency` on the agreement, `isCommitted` + restatement columns, `recomputeGrantYear()`, invariants 8–9 |
| 4 | Which system records payments? | **Accounting is the record** | §1.3: `Disbursement` is a confirmation row keyed on `bankReference`; an import route, not a ledger; the screen that matters is approved-but-unpaid |
| 5 | Unspent money at closure? | **Case by case** | §1.4: `settlementMode` required with no default; `adjustedIntoBudgetId` required for a carry-forward |
| 6 | Is there a written DoA matrix? | **Yes, on paper** | §2.2: the deliverable is a faithful transcription of that policy; `policyReference` on every rule |
| 7 | Intake public or invitation-only? | **Open call** | §3 stays at full scope; pipeline half ships first, portal on top |
| 8 | Restricted funds? | **Single funder** | §5.1 **cut**; only the granting-unit allocation check survives, into §2.2 |

### What the answers changed, in order of consequence

1. **§1.3 is a different section now.** It was specced as a disbursement
   ledger with a generated schedule. It is now a confirmation layer over
   accounting, with a schedule that is a *projection* of the budget whose later
   years are explicitly not promises. The new failure mode to design against is
   not a lost payment — it is a forecast that shows indicative money as
   committed.
2. **The `Decimal` sweep became real work and moved early.** 2–3 weeks that was
   not in the original phase list, landing beside §2.1 because both get more
   expensive the longer there are rows to migrate.
3. **§5.1 came out and §3 stayed in** — roughly cancelling each other in total
   weeks, but §3 is now the single largest commitment in the plan and the one
   whose public surface carries ongoing cost.

