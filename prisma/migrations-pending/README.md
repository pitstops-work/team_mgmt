# Pending migrations — deliberately not in `prisma/migrations/`

`npm run build` runs `scripts/migrate-deploy.mjs`, which applies **every folder
under `prisma/migrations/`** on the next deploy. Anything here is therefore
*not* scheduled: it sits outside that directory precisely so that it cannot run
by accident, and is moved in by a person who has rehearsed it.

## 1. `Float` → `Decimal(14,2)` on the existing money columns

**Status: written up, not written.** The grant-lifecycle models already use
`Decimal(14,2)`; this is the sweep of the legacy columns so that the two sides
stop needing a tolerance between them.

### Why it matters

`0.1 + 0.2 !== 0.3` in binary floating point. In a chart that is invisible; in
a ledger that reconciles against a bank statement it is unrecoverable, because
nothing records what the true figure was. The mixed-type alternative — a
`compareMoney(a, b, { tolerance })` helper at every crossing point — works only
while every call site remembers to use it. One bare `===` and a reconciliation
fails silently, which is the failure this is meant to end.

### Why it is not in this change

It is the only genuinely non-additive migration in the grant-ERP work, and
`.env.local` points at **production Neon**. It needs a rehearsal, not a deploy.

### The columns

Inventory before touching anything — this list is a starting point, not a
guarantee:

- `BudgetLine.y1Total … y5Total`, `y1UnitCost … y5UnitCost`, `y1AllocPct …
  y5AllocPct`
- `BudgetReportLine.actualAmount`
- `BudgetReport.openingBalance`, `tranchesReceived`, `interestEarned`,
  `fdBalance`
- `BudgetReportFd` face/maturity/interest/TDS columns
- `BudgetReallocationRequest.requestedAmount`, `approvedAmount`,
  `monthlyAmount`, `sourceUnspent`
- `GrantBorrowing.amount`
- `CostRegistry` rate columns and `CostRegistryHistory`
- `Budget.approvedAmount` (also read by the comparables query)
- `BudgetLineCostHistory.oldCost`, `newCost`

### The order to do it in

1. **Inventory the reads, not just the columns.** Change the types in the schema
   and let `tsc` find every call site — that is the point of doing it as one
   typed change rather than column by column. Expect a long list in the export
   and report paths.
2. **Expect strings at the API boundary.** Prisma's `Decimal` serialises to a
   string, so any client-side arithmetic on these values will silently
   concatenate instead of adding. Convert explicitly with
   `toNumber()` from `lib/budget/money.ts` at the edge; do not coerce with `+`.
3. **Rehearse on a Neon branch.** Not on production, and not on a local copy
   with different data.
4. **Diff the exported workbooks byte-for-byte, before and after.** An export
   that changes is a bug in the sweep, not an improvement. The APF-exact xlsx is
   the most sensitive artefact in the portal and the one a partner will notice.
5. **Only then** move the folder into `prisma/migrations/` and deploy.
6. Afterwards, delete every remaining `tolerance` argument to `compareMoney`.
   Each one is then a bug.

### Rough size

2–3 weeks of work, mostly in the export and report paths rather than the
migration itself.

### Do it early

The cost grows with every money row written as `Float`. It is cheapest now and
more expensive once there are disbursement and closure rows to migrate too.
