-- AlterTable Pitstop: add ownerId
ALTER TABLE "Pitstop" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Pitstop" ADD CONSTRAINT "Pitstop_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable AppSetting
CREATE TABLE "AppSetting" (
  "key"   TEXT NOT NULL,
  "value" TEXT NOT NULL,
  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
