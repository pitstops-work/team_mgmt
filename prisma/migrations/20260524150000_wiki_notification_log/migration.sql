-- CreateTable
CREATE TABLE "WikiNotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiNotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiNotificationLog_userId_createdAt_idx" ON "WikiNotificationLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WikiNotificationLog_pageId_idx" ON "WikiNotificationLog"("pageId");

-- CreateIndex
CREATE INDEX "WikiNotificationLog_kind_createdAt_idx" ON "WikiNotificationLog"("kind", "createdAt");

-- AddForeignKey
ALTER TABLE "WikiNotificationLog" ADD CONSTRAINT "WikiNotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiNotificationLog" ADD CONSTRAINT "WikiNotificationLog_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
