-- Grant lifecycle: decision, agreement, documents, tranches, disbursement,
-- closure, authority, compliance, conflict, intake and results.
--
-- Fully ADDITIVE: 28 new tables, new nullable columns on Budget/Goal/
-- ActionPoint/Risk/GrantAgreement, and one enum value (BudgetStatus.closed).
-- Generated offline with 'prisma migrate diff' between the previous and new
-- datamodels, so it never touched the live database.
--
-- NOT included: the Float -> Decimal sweep of the existing money columns.
-- That one is destructive and rehearsal-gated — see prisma/migrations-pending/.
--
-- AFTER THIS APPLIES, RUN:
--   npx tsx scripts/seed-authority-rules.ts --apply
-- requireAuthority() refuses when no rule matches, so until the ruleset is
-- seeded every amount-bearing route stops. That is the intended failure
-- mode (loud, not silent), but it does mean the seed is part of the deploy.

-- CreateEnum
CREATE TYPE "GrantDecisionOutcome" AS ENUM ('approved', 'approved_with_conditions', 'deferred', 'declined', 'withdrawn');

-- CreateEnum
CREATE TYPE "GrantDecisionForum" AS ENUM ('gc', 'internal', 'written_resolution');

-- CreateEnum
CREATE TYPE "GrantConditionTiming" AS ENUM ('pre_disbursement', 'pre_tranche', 'during_grant', 'pre_closure');

-- CreateEnum
CREATE TYPE "GrantConditionStatus" AS ENUM ('open', 'discharged', 'waived');

-- CreateEnum
CREATE TYPE "GrantVote" AS ENUM ('for', 'against', 'abstained', 'recused');

-- CreateEnum
CREATE TYPE "GrantAgreementStatus" AS ENUM ('drafting', 'sent_for_signature', 'executed', 'terminated');

-- CreateEnum
CREATE TYPE "GrantDocumentKind" AS ENUM ('proposal', 'dd_evidence', 'appraisal_note', 'board_minutes', 'agreement_draft', 'agreement_executed', 'amendment_deed', 'condition_evidence', 'budget_workbook', 'financial_report', 'narrative_report', 'utilisation_certificate', 'audited_accounts', 'fcra_return', 'disbursement_advice', 'bank_statement', 'asset_register', 'closure_report', 'other');

-- CreateEnum
CREATE TYPE "TrancheFrequency" AS ENUM ('annual', 'half_yearly', 'quarterly');

-- CreateEnum
CREATE TYPE "TrancheStatus" AS ENUM ('planned', 'blocked', 'requested', 'approved', 'released', 'partially_released', 'cancelled');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('pending', 'released', 'failed', 'returned', 'recovered');

-- CreateEnum
CREATE TYPE "DisbursementRequestStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "GrantClosureStatus" AS ENUM ('open', 'closing', 'closed', 'closed_with_exception');

-- CreateEnum
CREATE TYPE "GrantExitDecision" AS ENUM ('undecided', 'renew', 'exit', 'pause');

-- CreateEnum
CREATE TYPE "ConflictDisposition" AS ENUM ('disclose', 'recuse');

-- CreateEnum
CREATE TYPE "FundingWindowStatus" AS ENUM ('draft', 'open', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "ProposalStage" AS ENUM ('received', 'screening', 'eligible', 'ineligible', 'due_diligence', 'appraisal', 'decided', 'withdrawn');

-- AlterEnum
ALTER TYPE "BudgetStatus" ADD VALUE 'closed';

-- AlterTable
ALTER TABLE "Goal" ADD COLUMN     "fundingBudgetId" TEXT,
ADD COLUMN     "fundingSharePct" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Risk" ADD COLUMN     "budgetId" TEXT,
ADD COLUMN     "reviewDueOn" DATE,
ADD COLUMN     "sourceDecisionId" TEXT;

-- AlterTable
ALTER TABLE "ActionPoint" ADD COLUMN     "fundingBudgetId" TEXT;

-- CreateTable
CREATE TABLE "GrantDecision" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "outcome" "GrantDecisionOutcome" NOT NULL,
    "forum" "GrantDecisionForum" NOT NULL,
    "decidedOn" DATE NOT NULL,
    "approvedAmount" DECIMAL(14,2) NOT NULL,
    "variationNote" TEXT,
    "approvedMonths" INTEGER,
    "budgetSnapshot" JSONB NOT NULL DEFAULT '{}',
    "reasonCode" TEXT,
    "reasonNote" TEXT,
    "assemblyId" TEXT,
    "supersedesId" TEXT,
    "meetingId" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantCondition" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "timing" "GrantConditionTiming" NOT NULL,
    "blocksTrancheNumber" INTEGER,
    "status" "GrantConditionStatus" NOT NULL DEFAULT 'open',
    "dueOn" DATE,
    "dischargedById" TEXT,
    "dischargedAt" TIMESTAMP(3),
    "dischargeNote" TEXT,
    "waivedById" TEXT,
    "waivedAt" TIMESTAMP(3),
    "waiverNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantMeeting" (
    "id" TEXT NOT NULL,
    "forum" "GrantDecisionForum" NOT NULL,
    "heldOn" DATE NOT NULL,
    "reference" TEXT,
    "attendance" JSONB NOT NULL DEFAULT '[]',
    "minutesNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantDecisionVote" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "userId" TEXT,
    "voterName" TEXT,
    "vote" "GrantVote" NOT NULL,
    "note" TEXT,

    CONSTRAINT "GrantDecisionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantAgreement" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "decisionId" TEXT,
    "status" "GrantAgreementStatus" NOT NULL DEFAULT 'drafting',
    "reference" TEXT,
    "granteeSignatoryName" TEXT,
    "granteeSignatoryRole" TEXT,
    "granteeSignedOn" DATE,
    "funderSignatoryName" TEXT,
    "funderSignatoryRole" TEXT,
    "funderSignedOn" DATE,
    "executedOn" DATE,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "terminatedOn" DATE,
    "terminationReason" TEXT,
    "trancheFrequency" "TrancheFrequency" NOT NULL DEFAULT 'annual',
    "amendsId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantAgreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantAgreementSignoff" (
    "id" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "preparedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNotes" TEXT,

    CONSTRAINT "GrantAgreementSignoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantDocument" (
    "id" TEXT NOT NULL,
    "kind" "GrantDocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "budgetId" TEXT,
    "agreementId" TEXT,
    "conditionId" TEXT,
    "meetingId" TEXT,
    "disbursementId" TEXT,
    "closureId" TEXT,
    "proposalId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantDocumentRequirement" (
    "id" TEXT NOT NULL,
    "kind" "GrantDocumentKind" NOT NULL,
    "grantingUnitId" TEXT,
    "timing" "GrantConditionTiming" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "GrantDocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantTranche" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "trancheNumber" INTEGER NOT NULL,
    "grantYear" INTEGER NOT NULL,
    "plannedOn" DATE NOT NULL,
    "plannedAmount" DECIMAL(14,2) NOT NULL,
    "status" "TrancheStatus" NOT NULL DEFAULT 'planned',
    "isCommitted" BOOLEAN NOT NULL DEFAULT false,
    "committedAt" TIMESTAMP(3),
    "restatedFromAmount" DECIMAL(14,2),
    "restatedAt" TIMESTAMP(3),
    "restatementNote" TEXT,
    "releaseRuleNote" TEXT,
    "gatingSlotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantTranche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisbursementRequest" (
    "id" TEXT NOT NULL,
    "trancheId" TEXT NOT NULL,
    "requestedAmount" DECIMAL(14,2) NOT NULL,
    "gateSnapshot" JSONB NOT NULL DEFAULT '{}',
    "justification" TEXT NOT NULL,
    "status" "DisbursementRequestStatus" NOT NULL DEFAULT 'draft',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisbursementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisbursementApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorityRuleId" TEXT,
    "authoritySnapshot" JSONB NOT NULL DEFAULT '{}',
    "approverId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "note" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DisbursementApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Disbursement" (
    "id" TEXT NOT NULL,
    "trancheId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "requestId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "tdsAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(14,2) NOT NULL,
    "valueDate" DATE NOT NULL,
    "bankReference" TEXT,
    "instrument" TEXT,
    "fromAccountLabel" TEXT,
    "status" "DisbursementStatus" NOT NULL DEFAULT 'pending',
    "failureNote" TEXT,
    "reconciledReportId" TEXT,
    "reconciledAt" TIMESTAMP(3),
    "reconciliationDelta" DECIMAL(14,2),
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Disbursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantClosure" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "status" "GrantClosureStatus" NOT NULL DEFAULT 'open',
    "initiatedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "totalReleased" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalUtilised" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unspentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "settlementMode" TEXT,
    "adjustedIntoBudgetId" TEXT,
    "refundReceivedOn" DATE,
    "refundAmount" DECIMAL(14,2),
    "refundReference" TEXT,
    "writeOffNote" TEXT,
    "borrowingsSettled" BOOLEAN NOT NULL DEFAULT false,
    "exitDecision" "GrantExitDecision" NOT NULL DEFAULT 'undecided',
    "exitNote" TEXT,
    "exceptionNote" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantAsset" (
    "id" TEXT NOT NULL,
    "closureId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "cost" DECIMAL(14,2) NOT NULL,
    "acquiredOn" DATE,
    "disposition" TEXT NOT NULL,
    "dispositionNote" TEXT,

    CONSTRAINT "GrantAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantClosureReminderLog" (
    "id" TEXT NOT NULL,
    "closureId" TEXT NOT NULL,
    "threshold" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrantClosureReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityRule" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "grantingUnitId" TEXT,
    "domain" TEXT,
    "roleId" TEXT,
    "userId" TEXT,
    "maxAmount" DECIMAL(14,2),
    "approvalsRequired" INTEGER NOT NULL DEFAULT 1,
    "excludeSubmitter" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "policyReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthorityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityDelegation" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "action" TEXT,
    "maxAmount" DECIMAL(14,2),
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorityDelegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgCompliance" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "identifier" TEXT,
    "issuedOn" DATE,
    "validUntil" DATE,
    "documentId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgCompliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceKindConfig" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "blocksRelease" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "warnDays" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,

    CONSTRAINT "ComplianceKindConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConflictDeclaration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "disposition" "ConflictDisposition" NOT NULL DEFAULT 'disclose',
    "declaredOn" DATE NOT NULL,
    "endedOn" DATE,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConflictDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingWindow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "grantingUnitId" TEXT,
    "status" "FundingWindowStatus" NOT NULL DEFAULT 'draft',
    "opensOn" DATE,
    "closesOn" DATE,
    "brief" TEXT,
    "questions" JSONB NOT NULL DEFAULT '[]',
    "ceilingAmount" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "windowId" TEXT,
    "publicRef" TEXT NOT NULL,
    "orgId" TEXT,
    "applicantOrgName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "requestedAmount" DECIMAL(14,2),
    "requestedMonths" INTEGER,
    "domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "city" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "stage" "ProposalStage" NOT NULL DEFAULT 'received',
    "declineReasonCode" TEXT,
    "declineReasonNote" TEXT,
    "resumeTokenHash" TEXT,
    "resumeExpiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "budgetId" TEXT,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalRubric" (
    "id" TEXT NOT NULL,
    "windowId" TEXT,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalReview" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "rubricId" TEXT,
    "rubricSnapshot" JSONB NOT NULL DEFAULT '{}',
    "scores" JSONB NOT NULL DEFAULT '{}',
    "totalScore" DOUBLE PRECISION,
    "recommendation" TEXT,
    "note" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalEvent" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantResult" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'output',
    "indicator" TEXT NOT NULL,
    "unit" TEXT,
    "targetValue" DOUBLE PRECISION,
    "domain" TEXT,
    "derivedFrom" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrantResultValue" (
    "id" TEXT NOT NULL,
    "resultId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'grantee',
    "note" TEXT,
    "reviewerValue" DOUBLE PRECISION,
    "reviewerNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrantResultValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetReportNarrative" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sections" JSONB NOT NULL DEFAULT '[]',
    "deviationsNote" TEXT,
    "submittedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetReportNarrative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GrantDecision_supersedesId_key" ON "GrantDecision"("supersedesId");

-- CreateIndex
CREATE INDEX "GrantDecision_budgetId_decidedOn_idx" ON "GrantDecision"("budgetId", "decidedOn");

-- CreateIndex
CREATE INDEX "GrantDecision_outcome_decidedOn_idx" ON "GrantDecision"("outcome", "decidedOn");

-- CreateIndex
CREATE INDEX "GrantDecision_assemblyId_idx" ON "GrantDecision"("assemblyId");

-- CreateIndex
CREATE INDEX "GrantCondition_decisionId_status_idx" ON "GrantCondition"("decisionId", "status");

-- CreateIndex
CREATE INDEX "GrantCondition_status_timing_dueOn_idx" ON "GrantCondition"("status", "timing", "dueOn");

-- CreateIndex
CREATE INDEX "GrantMeeting_forum_heldOn_idx" ON "GrantMeeting"("forum", "heldOn");

-- CreateIndex
CREATE INDEX "GrantDecisionVote_decisionId_idx" ON "GrantDecisionVote"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantAgreement_budgetId_key" ON "GrantAgreement"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantAgreement_amendsId_key" ON "GrantAgreement"("amendsId");

-- CreateIndex
CREATE INDEX "GrantAgreement_status_executedOn_idx" ON "GrantAgreement"("status", "executedOn");

-- CreateIndex
CREATE UNIQUE INDEX "GrantAgreementSignoff_agreementId_key" ON "GrantAgreementSignoff"("agreementId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantDocument_supersedesId_key" ON "GrantDocument"("supersedesId");

-- CreateIndex
CREATE INDEX "GrantDocument_budgetId_kind_idx" ON "GrantDocument"("budgetId", "kind");

-- CreateIndex
CREATE INDEX "GrantDocument_kind_createdAt_idx" ON "GrantDocument"("kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrantDocumentRequirement_kind_grantingUnitId_timing_key" ON "GrantDocumentRequirement"("kind", "grantingUnitId", "timing");

-- CreateIndex
CREATE INDEX "GrantTranche_budgetId_grantYear_idx" ON "GrantTranche"("budgetId", "grantYear");

-- CreateIndex
CREATE INDEX "GrantTranche_status_plannedOn_idx" ON "GrantTranche"("status", "plannedOn");

-- CreateIndex
CREATE UNIQUE INDEX "GrantTranche_budgetId_trancheNumber_key" ON "GrantTranche"("budgetId", "trancheNumber");

-- CreateIndex
CREATE INDEX "DisbursementRequest_trancheId_idx" ON "DisbursementRequest"("trancheId");

-- CreateIndex
CREATE INDEX "DisbursementRequest_status_submittedAt_idx" ON "DisbursementRequest"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DisbursementApproval_requestId_approverId_key" ON "DisbursementApproval"("requestId", "approverId");

-- CreateIndex
CREATE INDEX "Disbursement_budgetId_valueDate_idx" ON "Disbursement"("budgetId", "valueDate");

-- CreateIndex
CREATE INDEX "Disbursement_status_valueDate_idx" ON "Disbursement"("status", "valueDate");

-- CreateIndex
CREATE INDEX "Disbursement_bankReference_idx" ON "Disbursement"("bankReference");

-- CreateIndex
CREATE UNIQUE INDEX "GrantClosure_budgetId_key" ON "GrantClosure"("budgetId");

-- CreateIndex
CREATE INDEX "GrantClosure_status_closedAt_idx" ON "GrantClosure"("status", "closedAt");

-- CreateIndex
CREATE INDEX "GrantAsset_closureId_idx" ON "GrantAsset"("closureId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantClosureReminderLog_closureId_threshold_key" ON "GrantClosureReminderLog"("closureId", "threshold");

-- CreateIndex
CREATE INDEX "AuthorityRule_action_isActive_priority_idx" ON "AuthorityRule"("action", "isActive", "priority");

-- CreateIndex
CREATE INDEX "AuthorityDelegation_toUserId_isActive_startsOn_endsOn_idx" ON "AuthorityDelegation"("toUserId", "isActive", "startsOn", "endsOn");

-- CreateIndex
CREATE INDEX "AuthorityDelegation_fromUserId_isActive_idx" ON "AuthorityDelegation"("fromUserId", "isActive");

-- CreateIndex
CREATE INDEX "OrgCompliance_validUntil_idx" ON "OrgCompliance"("validUntil");

-- CreateIndex
CREATE INDEX "OrgCompliance_kind_validUntil_idx" ON "OrgCompliance"("kind", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "OrgCompliance_orgId_kind_key" ON "OrgCompliance"("orgId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceKindConfig_kind_key" ON "ComplianceKindConfig"("kind");

-- CreateIndex
CREATE INDEX "ConflictDeclaration_userId_endedOn_idx" ON "ConflictDeclaration"("userId", "endedOn");

-- CreateIndex
CREATE INDEX "ConflictDeclaration_orgId_endedOn_idx" ON "ConflictDeclaration"("orgId", "endedOn");

-- CreateIndex
CREATE UNIQUE INDEX "FundingWindow_slug_key" ON "FundingWindow"("slug");

-- CreateIndex
CREATE INDEX "FundingWindow_status_closesOn_idx" ON "FundingWindow"("status", "closesOn");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_publicRef_key" ON "Proposal"("publicRef");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_budgetId_key" ON "Proposal"("budgetId");

-- CreateIndex
CREATE INDEX "Proposal_stage_createdAt_idx" ON "Proposal"("stage", "createdAt");

-- CreateIndex
CREATE INDEX "Proposal_windowId_stage_idx" ON "Proposal"("windowId", "stage");

-- CreateIndex
CREATE INDEX "Proposal_orgId_idx" ON "Proposal"("orgId");

-- CreateIndex
CREATE INDEX "ProposalRubric_windowId_isActive_idx" ON "ProposalRubric"("windowId", "isActive");

-- CreateIndex
CREATE INDEX "ProposalReview_proposalId_idx" ON "ProposalReview"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ProposalReview_proposalId_reviewerId_level_key" ON "ProposalReview"("proposalId", "reviewerId", "level");

-- CreateIndex
CREATE INDEX "ProposalEvent_proposalId_createdAt_idx" ON "ProposalEvent"("proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "GrantResult_budgetId_idx" ON "GrantResult"("budgetId");

-- CreateIndex
CREATE UNIQUE INDEX "GrantResultValue_resultId_slotId_key" ON "GrantResultValue"("resultId", "slotId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetReportNarrative_reportId_key" ON "BudgetReportNarrative"("reportId");

-- CreateIndex
CREATE INDEX "Risk_budgetId_status_idx" ON "Risk"("budgetId", "status");

-- CreateIndex
CREATE INDEX "Risk_reviewDueOn_idx" ON "Risk"("reviewDueOn");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_fundingBudgetId_fkey" FOREIGN KEY ("fundingBudgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_sourceDecisionId_fkey" FOREIGN KEY ("sourceDecisionId") REFERENCES "GrantDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_fundingBudgetId_fkey" FOREIGN KEY ("fundingBudgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDecision" ADD CONSTRAINT "GrantDecision_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDecision" ADD CONSTRAINT "GrantDecision_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "GrantDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDecision" ADD CONSTRAINT "GrantDecision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GrantMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDecision" ADD CONSTRAINT "GrantDecision_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantCondition" ADD CONSTRAINT "GrantCondition_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GrantDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantCondition" ADD CONSTRAINT "GrantCondition_dischargedById_fkey" FOREIGN KEY ("dischargedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantCondition" ADD CONSTRAINT "GrantCondition_waivedById_fkey" FOREIGN KEY ("waivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDecisionVote" ADD CONSTRAINT "GrantDecisionVote_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GrantDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDecisionVote" ADD CONSTRAINT "GrantDecisionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAgreement" ADD CONSTRAINT "GrantAgreement_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAgreement" ADD CONSTRAINT "GrantAgreement_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "GrantDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAgreement" ADD CONSTRAINT "GrantAgreement_amendsId_fkey" FOREIGN KEY ("amendsId") REFERENCES "GrantAgreement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAgreementSignoff" ADD CONSTRAINT "GrantAgreementSignoff_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "GrantAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAgreementSignoff" ADD CONSTRAINT "GrantAgreementSignoff_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAgreementSignoff" ADD CONSTRAINT "GrantAgreementSignoff_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAgreementSignoff" ADD CONSTRAINT "GrantAgreementSignoff_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "GrantDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "GrantAgreement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_conditionId_fkey" FOREIGN KEY ("conditionId") REFERENCES "GrantCondition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "GrantMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_disbursementId_fkey" FOREIGN KEY ("disbursementId") REFERENCES "Disbursement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "GrantClosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocument" ADD CONSTRAINT "GrantDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantDocumentRequirement" ADD CONSTRAINT "GrantDocumentRequirement_grantingUnitId_fkey" FOREIGN KEY ("grantingUnitId") REFERENCES "GrantingUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantTranche" ADD CONSTRAINT "GrantTranche_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantTranche" ADD CONSTRAINT "GrantTranche_gatingSlotId_fkey" FOREIGN KEY ("gatingSlotId") REFERENCES "BudgetReportSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementRequest" ADD CONSTRAINT "DisbursementRequest_trancheId_fkey" FOREIGN KEY ("trancheId") REFERENCES "GrantTranche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementRequest" ADD CONSTRAINT "DisbursementRequest_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementApproval" ADD CONSTRAINT "DisbursementApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DisbursementRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisbursementApproval" ADD CONSTRAINT "DisbursementApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_trancheId_fkey" FOREIGN KEY ("trancheId") REFERENCES "GrantTranche"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "DisbursementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_reconciledReportId_fkey" FOREIGN KEY ("reconciledReportId") REFERENCES "BudgetReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Disbursement" ADD CONSTRAINT "Disbursement_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantClosure" ADD CONSTRAINT "GrantClosure_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantClosure" ADD CONSTRAINT "GrantClosure_adjustedIntoBudgetId_fkey" FOREIGN KEY ("adjustedIntoBudgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantClosure" ADD CONSTRAINT "GrantClosure_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantAsset" ADD CONSTRAINT "GrantAsset_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "GrantClosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantClosureReminderLog" ADD CONSTRAINT "GrantClosureReminderLog_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "GrantClosure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityRule" ADD CONSTRAINT "AuthorityRule_grantingUnitId_fkey" FOREIGN KEY ("grantingUnitId") REFERENCES "GrantingUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityRule" ADD CONSTRAINT "AuthorityRule_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityRule" ADD CONSTRAINT "AuthorityRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityDelegation" ADD CONSTRAINT "AuthorityDelegation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityDelegation" ADD CONSTRAINT "AuthorityDelegation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityDelegation" ADD CONSTRAINT "AuthorityDelegation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgCompliance" ADD CONSTRAINT "OrgCompliance_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgCompliance" ADD CONSTRAINT "OrgCompliance_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictDeclaration" ADD CONSTRAINT "ConflictDeclaration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictDeclaration" ADD CONSTRAINT "ConflictDeclaration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConflictDeclaration" ADD CONSTRAINT "ConflictDeclaration_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingWindow" ADD CONSTRAINT "FundingWindow_grantingUnitId_fkey" FOREIGN KEY ("grantingUnitId") REFERENCES "GrantingUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "FundingWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalRubric" ADD CONSTRAINT "ProposalRubric_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "FundingWindow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalReview" ADD CONSTRAINT "ProposalReview_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalReview" ADD CONSTRAINT "ProposalReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalReview" ADD CONSTRAINT "ProposalReview_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "ProposalRubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalEvent" ADD CONSTRAINT "ProposalEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalEvent" ADD CONSTRAINT "ProposalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantResult" ADD CONSTRAINT "GrantResult_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantResultValue" ADD CONSTRAINT "GrantResultValue_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "GrantResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrantResultValue" ADD CONSTRAINT "GrantResultValue_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BudgetReportSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetReportNarrative" ADD CONSTRAINT "BudgetReportNarrative_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "BudgetReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

