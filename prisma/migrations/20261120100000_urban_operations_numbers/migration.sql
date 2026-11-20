-- Urban Operations, Phase 3: oversight and numbers.
-- A members table (who may open /urban besides admins) and three read-only
-- views the Team and Programme screens count from (rule R3).

CREATE TABLE "uo_member" (
  "userId"    TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "uo_member_pkey" PRIMARY KEY ("userId")
);
ALTER TABLE "uo_member" ADD CONSTRAINT "uo_member_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every place paired with itself and each place above it. Roll-ups join on this:
-- "everything in Bangalore" = rows with ancestorId = Bangalore.
CREATE VIEW "uo_place_ancestor" AS
WITH RECURSIVE a AS (
  SELECT p."id" AS "placeId", p."id" AS "ancestorId", 0 AS "depth", p."parentId" AS "next"
  FROM "uo_place" p
  UNION ALL
  SELECT a."placeId", q."id", a."depth" + 1, q."parentId"
  FROM a JOIN "uo_place" q ON q."id" = a."next"
)
SELECT "placeId", "ancestorId", "depth" FROM a;

-- The latest value of each reading, per effort and dimension (e.g. per scheme).
CREATE VIEW "uo_reading_latest" AS
SELECT DISTINCT ON (r."effortId", r."key", r."dimension")
  r."effortId", r."key", r."dimension", r."value", r."asOf"
FROM "uo_reading" r
ORDER BY r."effortId", r."key", r."dimension", r."asOf" DESC, r."updatedAt" DESC;

-- The latest needs assessment of each settlement, keyed by its /urban place.
CREATE VIEW "uo_settlement_assessment" AS
SELECT DISTINCT ON (p."id") p."id" AS "placeId", a.*
FROM "uo_place" p
JOIN "SettlementAssessment" a ON a."settlementId" = p."legacyId"
WHERE p."level" = 'settlement'
ORDER BY p."id", a."assessedAt" DESC, a."createdAt" DESC;
