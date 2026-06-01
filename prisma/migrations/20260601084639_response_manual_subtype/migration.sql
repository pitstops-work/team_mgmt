-- Response Manual subtype (Phase 1)
-- Adds:
--   1. Three columns to WikiPage (maturity, isSensitive, sensitiveNote)
--   2. WikiManualSection — 8 fixed sections per manual
--   3. WikiPracticeEntry — append-only practice-circle feed, section-targeted
--   4. WikiManualBoundary — typed module-to-module edges (hands_off / draws_on)

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "isSensitive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maturity" TEXT,
ADD COLUMN     "sensitiveNote" TEXT;

-- CreateIndex
CREATE INDEX "WikiPage_type_maturity_idx" ON "WikiPage"("type", "maturity");

-- CreateTable
CREATE TABLE "WikiManualSection" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "sectionNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "lastEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEditedById" TEXT,

    CONSTRAINT "WikiManualSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiManualSection_pageId_idx" ON "WikiManualSection"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiManualSection_pageId_sectionNumber_key" ON "WikiManualSection"("pageId", "sectionNumber");

-- AddForeignKey
ALTER TABLE "WikiManualSection" ADD CONSTRAINT "WikiManualSection_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiManualSection" ADD CONSTRAINT "WikiManualSection_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WikiPracticeEntry" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "sectionNumber" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "observerId" TEXT NOT NULL,
    "settlement" TEXT,
    "partnerOrgId" TEXT,
    "happenedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'raw',
    "promotedToSectionNumber" INTEGER,
    "promotedById" TEXT,
    "promotedAt" TIMESTAMP(3),
    "circleId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPracticeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiPracticeEntry_pageId_sectionNumber_idx" ON "WikiPracticeEntry"("pageId", "sectionNumber");

-- CreateIndex
CREATE INDEX "WikiPracticeEntry_pageId_status_idx" ON "WikiPracticeEntry"("pageId", "status");

-- CreateIndex
CREATE INDEX "WikiPracticeEntry_observerId_happenedAt_idx" ON "WikiPracticeEntry"("observerId", "happenedAt");

-- CreateIndex
CREATE INDEX "WikiPracticeEntry_status_createdAt_idx" ON "WikiPracticeEntry"("status", "createdAt");

-- CreateIndex
CREATE INDEX "WikiPracticeEntry_circleId_idx" ON "WikiPracticeEntry"("circleId");

-- CreateIndex
CREATE INDEX "WikiPracticeEntry_archivedAt_idx" ON "WikiPracticeEntry"("archivedAt");

-- AddForeignKey
ALTER TABLE "WikiPracticeEntry" ADD CONSTRAINT "WikiPracticeEntry_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPracticeEntry" ADD CONSTRAINT "WikiPracticeEntry_observerId_fkey" FOREIGN KEY ("observerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPracticeEntry" ADD CONSTRAINT "WikiPracticeEntry_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPracticeEntry" ADD CONSTRAINT "WikiPracticeEntry_promotedById_fkey" FOREIGN KEY ("promotedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPracticeEntry" ADD CONSTRAINT "WikiPracticeEntry_circleId_fkey" FOREIGN KEY ("circleId") REFERENCES "WikiPracticeCircle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "WikiManualBoundary" (
    "id" TEXT NOT NULL,
    "fromPageId" TEXT NOT NULL,
    "toPageId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiManualBoundary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiManualBoundary_fromPageId_idx" ON "WikiManualBoundary"("fromPageId");

-- CreateIndex
CREATE INDEX "WikiManualBoundary_toPageId_idx" ON "WikiManualBoundary"("toPageId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiManualBoundary_fromPageId_toPageId_kind_key" ON "WikiManualBoundary"("fromPageId", "toPageId", "kind");

-- AddForeignKey
ALTER TABLE "WikiManualBoundary" ADD CONSTRAINT "WikiManualBoundary_fromPageId_fkey" FOREIGN KEY ("fromPageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiManualBoundary" ADD CONSTRAINT "WikiManualBoundary_toPageId_fkey" FOREIGN KEY ("toPageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
