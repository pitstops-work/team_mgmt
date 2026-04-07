ALTER TABLE "Pitstop" ADD COLUMN "customType" TEXT;

CREATE TABLE "CustomPitstopType" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CustomPitstopType_name_key" ON "CustomPitstopType"("name");
