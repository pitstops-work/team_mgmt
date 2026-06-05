-- Wiki v2: Articles + Spine. New programme-reference wiki organised around the
-- assessment a CO is doing in the field. Articles are atomic units of content
-- (one chapter / pathway / question / framework topic). A spine is an ordered
-- traversal (e.g. the EVRAT v4 questionnaire for Elderly). Links connect a
-- question article to companion articles in 3 panels: guideline / care_plan /
-- action_manual. Edit-once propagates to every question where a shared article
-- appears; Fork escape hatch creates a question-specific copy.

-- CreateTable
CREATE TABLE "WikiArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "programDomain" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "naturalOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "archivedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "forkedFromId" TEXT,

    CONSTRAINT "WikiArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiArticleVersion" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedById" TEXT NOT NULL,
    "summary" TEXT,

    CONSTRAINT "WikiArticleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiArticleLink" (
    "id" TEXT NOT NULL,
    "fromArticleId" TEXT NOT NULL,
    "toArticleId" TEXT NOT NULL,
    "panel" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WikiArticleLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiSpine" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "programDomain" TEXT NOT NULL,

    CONSTRAINT "WikiSpine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiSpineEntry" (
    "id" TEXT NOT NULL,
    "spineId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "articleId" TEXT NOT NULL,
    "sectionLabel" TEXT,

    CONSTRAINT "WikiSpineEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WikiArticle_slug_key" ON "WikiArticle"("slug");

-- CreateIndex
CREATE INDEX "WikiArticle_programDomain_kind_naturalOrder_idx" ON "WikiArticle"("programDomain", "kind", "naturalOrder");

-- CreateIndex
CREATE INDEX "WikiArticle_archivedAt_idx" ON "WikiArticle"("archivedAt");

-- CreateIndex
CREATE INDEX "WikiArticle_forkedFromId_idx" ON "WikiArticle"("forkedFromId");

-- CreateIndex
CREATE INDEX "WikiArticleVersion_savedById_idx" ON "WikiArticleVersion"("savedById");

-- CreateIndex
CREATE UNIQUE INDEX "WikiArticleVersion_articleId_versionNumber_key" ON "WikiArticleVersion"("articleId", "versionNumber");

-- CreateIndex
CREATE INDEX "WikiArticleLink_toArticleId_panel_idx" ON "WikiArticleLink"("toArticleId", "panel");

-- CreateIndex
CREATE INDEX "WikiArticleLink_fromArticleId_panel_ordinal_idx" ON "WikiArticleLink"("fromArticleId", "panel", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "WikiArticleLink_fromArticleId_toArticleId_panel_key" ON "WikiArticleLink"("fromArticleId", "toArticleId", "panel");

-- CreateIndex
CREATE UNIQUE INDEX "WikiSpine_slug_key" ON "WikiSpine"("slug");

-- CreateIndex
CREATE INDEX "WikiSpine_programDomain_idx" ON "WikiSpine"("programDomain");

-- CreateIndex
CREATE INDEX "WikiSpineEntry_spineId_idx" ON "WikiSpineEntry"("spineId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiSpineEntry_spineId_ordinal_key" ON "WikiSpineEntry"("spineId", "ordinal");

-- AddForeignKey
ALTER TABLE "WikiArticle" ADD CONSTRAINT "WikiArticle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiArticle" ADD CONSTRAINT "WikiArticle_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiArticle" ADD CONSTRAINT "WikiArticle_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiArticle" ADD CONSTRAINT "WikiArticle_forkedFromId_fkey" FOREIGN KEY ("forkedFromId") REFERENCES "WikiArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiArticleVersion" ADD CONSTRAINT "WikiArticleVersion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "WikiArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiArticleVersion" ADD CONSTRAINT "WikiArticleVersion_savedById_fkey" FOREIGN KEY ("savedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiArticleLink" ADD CONSTRAINT "WikiArticleLink_fromArticleId_fkey" FOREIGN KEY ("fromArticleId") REFERENCES "WikiArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiArticleLink" ADD CONSTRAINT "WikiArticleLink_toArticleId_fkey" FOREIGN KEY ("toArticleId") REFERENCES "WikiArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiSpineEntry" ADD CONSTRAINT "WikiSpineEntry_spineId_fkey" FOREIGN KEY ("spineId") REFERENCES "WikiSpine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiSpineEntry" ADD CONSTRAINT "WikiSpineEntry_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "WikiArticle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
