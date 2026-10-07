-- Recruitment: a scouting desk whose ROLE has no city.
--
-- Remote, national and central-team roles have no local context to be judged
-- against. Until now every desk inherited a city — the JD's primary one when
-- the recruiter was never asked — so a central-team hire was scouted against
-- a field post's language, local reference orgs and travel expectations.
--
-- NOT the same as the "unplaced" desk, which also has locationId NULL. That
-- one means "we don't know the city YET" and exists so the recruiter can sort
-- those people into cities later; this one means there is no city to find and
-- must never ask. Both are locationId NULL, which is exactly why this cannot
-- be inferred from the absence of a location and needs its own flag.
--
-- The prompt half of the same fact is the __NO_CITY__ sentinel frozen into
-- jobSnapshotJson.location.city — the column answers "how do I render this
-- row", the sentinel answers "what prompt does this desk get, forever".
--
-- locationChangedAt records that an EXISTING desk was converted after it was
-- scouted: the candidate write-ups still reflect the old city until someone
-- re-scouts, and the desk says so rather than quietly misrepresenting them.
--
-- Additive-only: two columns, no index, no FK, no backfill. DEFAULT false is
-- already the correct value for every existing row, including the two desks
-- that currently have no location. On PG11+ a NOT NULL DEFAULT <constant> add
-- is catalog-only — no table rewrite, no lock risk on a live table.

ALTER TABLE "RecruitmentScoutingDay" ADD COLUMN     "notCitySpecific" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RecruitmentScoutingDay" ADD COLUMN     "locationChangedAt" TIMESTAMP(3);
