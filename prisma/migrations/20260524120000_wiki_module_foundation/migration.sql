-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orgId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "whatsappOptIn" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "canonicalLang" TEXT NOT NULL DEFAULT 'en',
    "canonicalContent" TEXT NOT NULL DEFAULT '',
    "translatedContent" JSONB NOT NULL DEFAULT '{}',
    "ownerId" TEXT,
    "ownerTermStart" TIMESTAMP(3),
    "ownerTermEnd" TIMESTAMP(3),
    "nextReviewDue" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "lastEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEditedById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPageTag" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "tagType" TEXT NOT NULL,
    "tagValue" TEXT NOT NULL,

    CONSTRAINT "WikiPageTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPageVersion" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeNote" TEXT,

    CONSTRAINT "WikiPageVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiComment" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "sectionAnchor" TEXT,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "WikiComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiFlag" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "flaggerId" TEXT NOT NULL,
    "sectionAnchor" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "WikiFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiReviewCycle" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "completionNote" TEXT,
    "type" TEXT NOT NULL,
    "triggerSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiReviewCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiStaff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wikiRole" TEXT NOT NULL,
    "scope" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiStaff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Org_slug_key" ON "Org"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "WikiPage_slug_key" ON "WikiPage"("slug");

-- CreateIndex
CREATE INDEX "WikiPage_status_idx" ON "WikiPage"("status");

-- CreateIndex
CREATE INDEX "WikiPage_type_idx" ON "WikiPage"("type");

-- CreateIndex
CREATE INDEX "WikiPage_nextReviewDue_idx" ON "WikiPage"("nextReviewDue");

-- CreateIndex
CREATE INDEX "WikiPage_ownerId_idx" ON "WikiPage"("ownerId");

-- CreateIndex
CREATE INDEX "WikiPageTag_tagType_tagValue_idx" ON "WikiPageTag"("tagType", "tagValue");

-- CreateIndex
CREATE UNIQUE INDEX "WikiPageTag_pageId_tagType_tagValue_key" ON "WikiPageTag"("pageId", "tagType", "tagValue");

-- CreateIndex
CREATE INDEX "WikiPageVersion_editedById_idx" ON "WikiPageVersion"("editedById");

-- CreateIndex
CREATE UNIQUE INDEX "WikiPageVersion_pageId_versionNumber_key" ON "WikiPageVersion"("pageId", "versionNumber");

-- CreateIndex
CREATE INDEX "WikiComment_pageId_idx" ON "WikiComment"("pageId");

-- CreateIndex
CREATE INDEX "WikiComment_authorId_idx" ON "WikiComment"("authorId");

-- CreateIndex
CREATE INDEX "WikiFlag_pageId_status_idx" ON "WikiFlag"("pageId", "status");

-- CreateIndex
CREATE INDEX "WikiFlag_flaggerId_idx" ON "WikiFlag"("flaggerId");

-- CreateIndex
CREATE INDEX "WikiReviewCycle_pageId_idx" ON "WikiReviewCycle"("pageId");

-- CreateIndex
CREATE INDEX "WikiReviewCycle_ownerId_completedAt_idx" ON "WikiReviewCycle"("ownerId", "completedAt");

-- CreateIndex
CREATE INDEX "WikiStaff_wikiRole_idx" ON "WikiStaff"("wikiRole");

-- CreateIndex
CREATE UNIQUE INDEX "WikiStaff_userId_wikiRole_key" ON "WikiStaff"("userId", "wikiRole");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_lastEditedById_fkey" FOREIGN KEY ("lastEditedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageTag" ADD CONSTRAINT "WikiPageTag_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageVersion" ADD CONSTRAINT "WikiPageVersion_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageVersion" ADD CONSTRAINT "WikiPageVersion_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiComment" ADD CONSTRAINT "WikiComment_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiComment" ADD CONSTRAINT "WikiComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiComment" ADD CONSTRAINT "WikiComment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiFlag" ADD CONSTRAINT "WikiFlag_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiFlag" ADD CONSTRAINT "WikiFlag_flaggerId_fkey" FOREIGN KEY ("flaggerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiReviewCycle" ADD CONSTRAINT "WikiReviewCycle_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiReviewCycle" ADD CONSTRAINT "WikiReviewCycle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiStaff" ADD CONSTRAINT "WikiStaff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
