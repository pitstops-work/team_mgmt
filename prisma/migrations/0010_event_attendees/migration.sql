CREATE TABLE "PitstopEventAttendee" (
  "id"      TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "userId"  TEXT NOT NULL,
  CONSTRAINT "PitstopEventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "PitstopEvent"("id") ON DELETE CASCADE,
  CONSTRAINT "PitstopEventAttendee_userId_fkey"  FOREIGN KEY ("userId")  REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "PitstopEventAttendee_eventId_userId_key" ON "PitstopEventAttendee"("eventId", "userId");
