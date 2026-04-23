-- CreateTable
CREATE TABLE "_RPClusters" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_RPClusters_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RPClusters_B_index" ON "_RPClusters"("B");

-- AddForeignKey
ALTER TABLE "_RPClusters" ADD CONSTRAINT "_RPClusters_A_fkey" FOREIGN KEY ("A") REFERENCES "Cluster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RPClusters" ADD CONSTRAINT "_RPClusters_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
