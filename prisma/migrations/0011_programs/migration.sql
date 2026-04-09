CREATE TABLE "Program" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "ownerId"     TEXT NOT NULL,
  "deletedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Program_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id")
);

CREATE TABLE "ProgramGoal" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "programId" TEXT NOT NULL,
  "goalId"    TEXT NOT NULL,
  CONSTRAINT "ProgramGoal_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE,
  CONSTRAINT "ProgramGoal_goalId_fkey"   FOREIGN KEY ("goalId")    REFERENCES "Goal"("id")    ON DELETE CASCADE
);
CREATE UNIQUE INDEX "ProgramGoal_programId_goalId_key" ON "ProgramGoal"("programId", "goalId");
