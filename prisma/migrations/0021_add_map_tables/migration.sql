-- CreateTable
CREATE TABLE "MapFeature" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'other',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementNote" (
    "settlement" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementNote_pkey" PRIMARY KEY ("settlement")
);
