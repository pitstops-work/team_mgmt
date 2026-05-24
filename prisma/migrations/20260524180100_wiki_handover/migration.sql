-- CreateTable
CREATE TABLE "WikiOwnerHandover" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "handoverNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiOwnerHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WikiOwnerHandover_pageId_status_idx" ON "WikiOwnerHandover"("pageId", "status");

-- CreateIndex
CREATE INDEX "WikiOwnerHandover_toUserId_status_idx" ON "WikiOwnerHandover"("toUserId", "status");

-- CreateIndex
CREATE INDEX "WikiPage_ownerTermEnd_idx" ON "WikiPage"("ownerTermEnd");

-- AddForeignKey
ALTER TABLE "WikiOwnerHandover" ADD CONSTRAINT "WikiOwnerHandover_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiOwnerHandover" ADD CONSTRAINT "WikiOwnerHandover_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiOwnerHandover" ADD CONSTRAINT "WikiOwnerHandover_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
