-- Add new NotificationType values for gap queue filer-loop and shadow records.
ALTER TYPE "NotificationType" ADD VALUE 'WikiGapAssigned';
ALTER TYPE "NotificationType" ADD VALUE 'WikiGapResolved';
ALTER TYPE "NotificationType" ADD VALUE 'WikiGapPublished';
ALTER TYPE "NotificationType" ADD VALUE 'WikiShadowRecorded';

-- Shared observation table for shadow visits + new-CO onboarding sessions.
-- See model docstring in schema.prisma.
CREATE TABLE "WikiPracticeObservation" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "observedUserId" TEXT,
    "partnerOrgId" TEXT,
    "vertical" TEXT NOT NULL,
    "city" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "openQuestions" TEXT,
    "driftFlagged" BOOLEAN NOT NULL DEFAULT false,
    "primaryPageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPracticeObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiPracticeObservation_kind_happenedAt_idx" ON "WikiPracticeObservation"("kind", "happenedAt");
CREATE INDEX "WikiPracticeObservation_observerId_happenedAt_idx" ON "WikiPracticeObservation"("observerId", "happenedAt");
CREATE INDEX "WikiPracticeObservation_partnerOrgId_kind_idx" ON "WikiPracticeObservation"("partnerOrgId", "kind");
CREATE INDEX "WikiPracticeObservation_vertical_happenedAt_idx" ON "WikiPracticeObservation"("vertical", "happenedAt");

ALTER TABLE "WikiPracticeObservation" ADD CONSTRAINT "WikiPracticeObservation_observerId_fkey"
    FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WikiPracticeObservation" ADD CONSTRAINT "WikiPracticeObservation_observedUserId_fkey"
    FOREIGN KEY ("observedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPracticeObservation" ADD CONSTRAINT "WikiPracticeObservation_partnerOrgId_fkey"
    FOREIGN KEY ("partnerOrgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WikiPracticeObservation" ADD CONSTRAINT "WikiPracticeObservation_primaryPageId_fkey"
    FOREIGN KEY ("primaryPageId") REFERENCES "WikiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
