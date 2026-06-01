-- Add soft-delete columns to the four wiki child models that lacked them.
-- WikiPage already has archivedAt. archivedById is informational only — kept
-- as a plain string (not an FK) to match the WikiPage pattern and avoid an
-- onDelete cascade rewriting historic rows when a user is removed.

-- WikiPage already had archivedAt; add archivedById for attribution parity.
ALTER TABLE "WikiPage" ADD COLUMN "archivedById" TEXT;

ALTER TABLE "WikiPracticeCircle"
  ADD COLUMN "archivedAt"   TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;
CREATE INDEX "WikiPracticeCircle_archivedAt_idx" ON "WikiPracticeCircle"("archivedAt");

ALTER TABLE "WikiPartnerReviewMeeting"
  ADD COLUMN "archivedAt"   TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;
CREATE INDEX "WikiPartnerReviewMeeting_archivedAt_idx" ON "WikiPartnerReviewMeeting"("archivedAt");

ALTER TABLE "WikiPracticeGap"
  ADD COLUMN "archivedAt"   TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;
CREATE INDEX "WikiPracticeGap_archivedAt_idx" ON "WikiPracticeGap"("archivedAt");

ALTER TABLE "WikiPracticeObservation"
  ADD COLUMN "archivedAt"   TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;
CREATE INDEX "WikiPracticeObservation_archivedAt_idx" ON "WikiPracticeObservation"("archivedAt");
