
-- AlterTable
ALTER TABLE "WikiReviewCycle" ADD COLUMN     "triggerCircleId" TEXT,
ADD COLUMN     "triggerPartnerReviewMeetingId" TEXT;

-- CreateTable
CREATE TABLE "WikiPracticeCircle" (
    "id" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "vertical" TEXT,
    "zoneId" TEXT,
    "facilitatorId" TEXT NOT NULL,
    "caseDiscussed" TEXT,
    "notes" TEXT,
    "recordingUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPracticeCircle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPartnerReviewMeeting" (
    "id" TEXT NOT NULL,
    "partnerOrgId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "practiceChangesNoted" TEXT,
    "notes" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPartnerReviewMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WikiPracticeCircleAttendees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WikiPracticeCircleAttendees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WikiPartnerReviewMeetingAttendees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WikiPartnerReviewMeetingAttendees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WikiPracticeCirclePages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WikiPracticeCirclePages_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_WikiPartnerReviewMeetingPages" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_WikiPartnerReviewMeetingPages_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "WikiPracticeCircle_scheduledFor_idx" ON "WikiPracticeCircle"("scheduledFor");

-- CreateIndex
CREATE INDEX "WikiPracticeCircle_facilitatorId_idx" ON "WikiPracticeCircle"("facilitatorId");

-- CreateIndex
CREATE INDEX "WikiPracticeCircle_zoneId_idx" ON "WikiPracticeCircle"("zoneId");

-- CreateIndex
CREATE INDEX "WikiPartnerReviewMeeting_scheduledFor_idx" ON "WikiPartnerReviewMeeting"("scheduledFor");

-- CreateIndex
CREATE INDEX "WikiPartnerReviewMeeting_partnerOrgId_idx" ON "WikiPartnerReviewMeeting"("partnerOrgId");

-- CreateIndex
CREATE INDEX "_WikiPracticeCircleAttendees_B_index" ON "_WikiPracticeCircleAttendees"("B");

-- CreateIndex
CREATE INDEX "_WikiPartnerReviewMeetingAttendees_B_index" ON "_WikiPartnerReviewMeetingAttendees"("B");

-- CreateIndex
CREATE INDEX "_WikiPracticeCirclePages_B_index" ON "_WikiPracticeCirclePages"("B");

-- CreateIndex
CREATE INDEX "_WikiPartnerReviewMeetingPages_B_index" ON "_WikiPartnerReviewMeetingPages"("B");

-- CreateIndex
CREATE UNIQUE INDEX "WikiReviewCycle_pageId_triggerCircleId_key" ON "WikiReviewCycle"("pageId", "triggerCircleId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiReviewCycle_pageId_triggerPartnerReviewMeetingId_key" ON "WikiReviewCycle"("pageId", "triggerPartnerReviewMeetingId");

-- AddForeignKey
ALTER TABLE "WikiReviewCycle" ADD CONSTRAINT "WikiReviewCycle_triggerCircleId_fkey" FOREIGN KEY ("triggerCircleId") REFERENCES "WikiPracticeCircle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiReviewCycle" ADD CONSTRAINT "WikiReviewCycle_triggerPartnerReviewMeetingId_fkey" FOREIGN KEY ("triggerPartnerReviewMeetingId") REFERENCES "WikiPartnerReviewMeeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPracticeCircle" ADD CONSTRAINT "WikiPracticeCircle_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPracticeCircle" ADD CONSTRAINT "WikiPracticeCircle_facilitatorId_fkey" FOREIGN KEY ("facilitatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPartnerReviewMeeting" ADD CONSTRAINT "WikiPartnerReviewMeeting_partnerOrgId_fkey" FOREIGN KEY ("partnerOrgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPracticeCircleAttendees" ADD CONSTRAINT "_WikiPracticeCircleAttendees_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPracticeCircleAttendees" ADD CONSTRAINT "_WikiPracticeCircleAttendees_B_fkey" FOREIGN KEY ("B") REFERENCES "WikiPracticeCircle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPartnerReviewMeetingAttendees" ADD CONSTRAINT "_WikiPartnerReviewMeetingAttendees_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPartnerReviewMeetingAttendees" ADD CONSTRAINT "_WikiPartnerReviewMeetingAttendees_B_fkey" FOREIGN KEY ("B") REFERENCES "WikiPartnerReviewMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPracticeCirclePages" ADD CONSTRAINT "_WikiPracticeCirclePages_A_fkey" FOREIGN KEY ("A") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPracticeCirclePages" ADD CONSTRAINT "_WikiPracticeCirclePages_B_fkey" FOREIGN KEY ("B") REFERENCES "WikiPracticeCircle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPartnerReviewMeetingPages" ADD CONSTRAINT "_WikiPartnerReviewMeetingPages_A_fkey" FOREIGN KEY ("A") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WikiPartnerReviewMeetingPages" ADD CONSTRAINT "_WikiPartnerReviewMeetingPages_B_fkey" FOREIGN KEY ("B") REFERENCES "WikiPartnerReviewMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

