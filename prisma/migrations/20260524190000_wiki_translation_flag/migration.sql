
-- CreateTable
CREATE TABLE "WikiTranslationFlag" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "flaggerId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WikiTranslationFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiTranslationFlag_status_idx" ON "WikiTranslationFlag"("status");

-- CreateIndex
CREATE INDEX "WikiTranslationFlag_pageId_language_idx" ON "WikiTranslationFlag"("pageId", "language");

-- AddForeignKey
ALTER TABLE "WikiTranslationFlag" ADD CONSTRAINT "WikiTranslationFlag_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiTranslationFlag" ADD CONSTRAINT "WikiTranslationFlag_flaggerId_fkey" FOREIGN KEY ("flaggerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

