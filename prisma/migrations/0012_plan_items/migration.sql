CREATE TABLE "PlanItem" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "date"        TIMESTAMP(3) NOT NULL,
  "type"        TEXT NOT NULL DEFAULT 'Note',
  "userId"      TEXT NOT NULL,
  "pitstopId"   TEXT,
  "deletedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanItem_userId_fkey"    FOREIGN KEY ("userId")    REFERENCES "User"("id")    ON DELETE CASCADE,
  CONSTRAINT "PlanItem_pitstopId_fkey" FOREIGN KEY ("pitstopId") REFERENCES "Pitstop"("id") ON DELETE SET NULL
);

CREATE INDEX "PlanItem_userId_date_idx" ON "PlanItem"("userId", "date");
