
-- CreateTable
CREATE TABLE "WikiPageView" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiPageView_pageId_createdAt_idx" ON "WikiPageView"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "WikiPageView_userId_createdAt_idx" ON "WikiPageView"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WikiPageView" ADD CONSTRAINT "WikiPageView_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageView" ADD CONSTRAINT "WikiPageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

