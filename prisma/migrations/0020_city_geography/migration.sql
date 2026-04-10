-- Add City as the top level of the geography hierarchy (above Zone)

CREATE TABLE "City" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- Zone now optionally belongs to a City
ALTER TABLE "Zone" ADD COLUMN "cityId" TEXT;
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Goal can be tagged directly to a City
CREATE TABLE "GoalCity" (
    "goalId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    CONSTRAINT "GoalCity_pkey" PRIMARY KEY ("goalId", "cityId")
);
ALTER TABLE "GoalCity" ADD CONSTRAINT "GoalCity_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalCity" ADD CONSTRAINT "GoalCity_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE CASCADE ON UPDATE CASCADE;
