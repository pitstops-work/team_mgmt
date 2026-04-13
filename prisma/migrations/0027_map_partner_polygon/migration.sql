CREATE TABLE "MapPartner" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "contactName" TEXT,
  "contactPhone" TEXT,
  "notes" TEXT,
  "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MapPartner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MapPartner_key_key" ON "MapPartner"("key");

CREATE TABLE "MapPolygon" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "partnerKey" TEXT NOT NULL,
  "zone" TEXT NOT NULL DEFAULT '',
  "cluster" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "coordinates" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MapPolygon_pkey" PRIMARY KEY ("id")
);
