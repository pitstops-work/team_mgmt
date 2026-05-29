-- Practice gap queue: "there is no page for the thing I am doing today."
-- Distinct from WikiFlag — see model docstring.

CREATE TABLE "WikiPracticeGap" (
    "id" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "oneLineNeed" TEXT NOT NULL,
    "suggestedTitle" TEXT,
    "city" TEXT,
    "partnerOrgId" TEXT,
    "filerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assignedOwnerId" TEXT,
    "curatorTriagerId" TEXT,
    "triagedAt" TIMESTAMP(3),
    "draftingDeadline" TIMESTAMP(3),
    "linkedPageId" TEXT,
    "declineReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WikiPracticeGap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiPracticeGap_status_idx" ON "WikiPracticeGap"("status");
CREATE INDEX "WikiPracticeGap_vertical_status_idx" ON "WikiPracticeGap"("vertical", "status");
CREATE INDEX "WikiPracticeGap_assignedOwnerId_status_idx" ON "WikiPracticeGap"("assignedOwnerId", "status");
CREATE INDEX "WikiPracticeGap_filerId_idx" ON "WikiPracticeGap"("filerId");
CREATE INDEX "WikiPracticeGap_createdAt_idx" ON "WikiPracticeGap"("createdAt");

ALTER TABLE "WikiPracticeGap" ADD CONSTRAINT "WikiPracticeGap_filerId_fkey"
    FOREIGN KEY ("filerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WikiPracticeGap" ADD CONSTRAINT "WikiPracticeGap_assignedOwnerId_fkey"
    FOREIGN KEY ("assignedOwnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPracticeGap" ADD CONSTRAINT "WikiPracticeGap_curatorTriagerId_fkey"
    FOREIGN KEY ("curatorTriagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPracticeGap" ADD CONSTRAINT "WikiPracticeGap_partnerOrgId_fkey"
    FOREIGN KEY ("partnerOrgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPracticeGap" ADD CONSTRAINT "WikiPracticeGap_linkedPageId_fkey"
    FOREIGN KEY ("linkedPageId") REFERENCES "WikiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
