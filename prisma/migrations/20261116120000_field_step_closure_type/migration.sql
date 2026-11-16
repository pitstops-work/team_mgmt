-- /field closure type: how a step is evidenced when it is marked done.
--
-- The legacy Operations path had this (ChecklistItem.completionType: Activity /
-- Voice / Upload), but the /field rebuild dropped it, so every field step closed
-- with a bare tick and the backend had nowhere to choose otherwise. This puts it
-- on the setup + visit templates (editable in /field/backend) and on the
-- materialised FieldStep (copied at materialise / resync).
--
-- The proof itself is an Attachment row: on the FieldStep for a setup step, on
-- the FieldVisitStep (one occurrence) for a visit step. `note` holds a voice
-- note's transcript.
--
-- Additive. Every existing row defaults to 'Activity' — exactly today's
-- behaviour — so nothing changes for RPs until an admin picks Voice / Upload.

-- AlterTable
ALTER TABLE "SetupStepTemplate" ADD COLUMN "closureType" TEXT NOT NULL DEFAULT 'Activity';
ALTER TABLE "VisitStepTemplate" ADD COLUMN "closureType" TEXT NOT NULL DEFAULT 'Activity';
ALTER TABLE "FieldStep" ADD COLUMN "closureType" TEXT NOT NULL DEFAULT 'Activity';
ALTER TABLE "FieldStep" ADD COLUMN "note" TEXT;
ALTER TABLE "FieldVisitStep" ADD COLUMN "note" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "fieldStepId" TEXT;
ALTER TABLE "Attachment" ADD COLUMN "fieldVisitStepId" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_fieldStepId_idx" ON "Attachment"("fieldStepId");
CREATE INDEX "Attachment_fieldVisitStepId_idx" ON "Attachment"("fieldVisitStepId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_fieldStepId_fkey" FOREIGN KEY ("fieldStepId") REFERENCES "FieldStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_fieldVisitStepId_fkey" FOREIGN KEY ("fieldVisitStepId") REFERENCES "FieldVisitStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
