-- Partner identity unifies on Org (kind="partner").
--
-- Before this migration four stores each minted their own partner identity with
-- no FK between them: Org (15 rows, map/wiki/seeding), GrantPartner (19 rows,
-- budgets), the legacy MapPartner (13 rows) and the review DB's own `orgs`
-- table. The same grantee existed up to four times over, matched only by name.
--
-- DDL and backfill ship together, deliberately: GrantPartner."orgId" ends this
-- migration NOT NULL, so splitting them would leave a deploy window where the
-- column is nullable and new rows can be written without an identity.

-- ── 1. Alias table ──────────────────────────────────────────────────────────
-- Name variants that resolve to one Org. Populated for the review portal's
-- free-text grant notes by scripts/backfill-partner-registry.ts.
CREATE TABLE "OrgAlias" (
    "id"         TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "alias"      TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "source"     TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrgAlias_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrgAlias_normalized_key" ON "OrgAlias"("normalized");
CREATE INDEX "OrgAlias_orgId_idx" ON "OrgAlias"("orgId");
ALTER TABLE "OrgAlias" ADD CONSTRAINT "OrgAlias_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 2. GrantPartner.orgId ───────────────────────────────────────────────────
ALTER TABLE "GrantPartner" ADD COLUMN "orgId" TEXT;

-- Link every grant relationship to its org by normalised name. This is the same
-- name match `importGrantPartnersFromOrgs` has always used to copy Org rows
-- into GrantPartner, so it reproduces the pairings that are already live.
UPDATE "GrantPartner" gp
SET "orgId" = o."id"
FROM "Org" o
WHERE o."kind" = 'partner'
  AND regexp_replace(lower(o."name"), '[^a-z0-9]', '', 'g')
    = regexp_replace(lower(gp."name"), '[^a-z0-9]', '', 'g');

-- Four grantees hold budgets but have no Org row (APSA, Prajayatna, SPASTN,
-- Vidyasagar): they could be funded but could not own a settlement, a cluster
-- or a wiki practice. Mint the missing identity from the name on the grant
-- relationship. mapKey stays NULL — these have no map layer of their own, and
-- the column is uniquely indexed.
INSERT INTO "Org" ("id", "name", "slug", "kind", "color", "createdAt", "updatedAt")
SELECT
    'org_' || substr(md5(gen_random_uuid()::text), 1, 20),
    gp."name",
    regexp_replace(regexp_replace(lower(gp."name"), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g'),
    'partner',
    '#6366f1',
    now(),
    now()
FROM (SELECT DISTINCT "name" FROM "GrantPartner" WHERE "orgId" IS NULL) gp
WHERE NOT EXISTS (
    SELECT 1 FROM "Org" o
    WHERE regexp_replace(regexp_replace(lower(o."name"), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')
        = regexp_replace(regexp_replace(lower(gp."name"), '[^a-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')
);

UPDATE "GrantPartner" gp
SET "orgId" = o."id"
FROM "Org" o
WHERE gp."orgId" IS NULL
  AND o."kind" = 'partner'
  AND regexp_replace(lower(o."name"), '[^a-z0-9]', '', 'g')
    = regexp_replace(lower(gp."name"), '[^a-z0-9]', '', 'g');

-- Refuse to finish rather than leave an unidentified grant relationship behind.
DO $$
DECLARE orphans int;
BEGIN
    SELECT count(*) INTO orphans FROM "GrantPartner" WHERE "orgId" IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION 'partner registry: % GrantPartner row(s) could not be resolved to an Org', orphans;
    END IF;
END $$;

ALTER TABLE "GrantPartner" ALTER COLUMN "orgId" SET NOT NULL;
CREATE UNIQUE INDEX "GrantPartner_grantingUnitId_orgId_key" ON "GrantPartner"("grantingUnitId", "orgId");
CREATE INDEX "GrantPartner_orgId_idx" ON "GrantPartner"("orgId");
ALTER TABLE "GrantPartner" ADD CONSTRAINT "GrantPartner_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 3. Partner logins attach to the org ─────────────────────────────────────
-- A login used to point at one GrantPartner row, which capped a grantee at one
-- granting unit's budgets. grantPartnerId survives as a nullable record of
-- where the login was first set up; orgId is what access checks read.
ALTER TABLE "GrantPartnerUser" ADD COLUMN "orgId" TEXT;

UPDATE "GrantPartnerUser" gpu
SET "orgId" = gp."orgId"
FROM "GrantPartner" gp
WHERE gp."id" = gpu."grantPartnerId";

DO $$
DECLARE orphans int;
BEGIN
    SELECT count(*) INTO orphans FROM "GrantPartnerUser" WHERE "orgId" IS NULL;
    IF orphans > 0 THEN
        RAISE EXCEPTION 'partner registry: % partner login(s) could not be resolved to an Org', orphans;
    END IF;
END $$;

ALTER TABLE "GrantPartnerUser" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "GrantPartnerUser" ALTER COLUMN "grantPartnerId" DROP NOT NULL;
ALTER TABLE "GrantPartnerUser" DROP CONSTRAINT IF EXISTS "GrantPartnerUser_grantPartnerId_fkey";
ALTER TABLE "GrantPartnerUser" ADD CONSTRAINT "GrantPartnerUser_grantPartnerId_fkey"
    FOREIGN KEY ("grantPartnerId") REFERENCES "GrantPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "GrantPartnerUser_orgId_idx" ON "GrantPartnerUser"("orgId");
ALTER TABLE "GrantPartnerUser" ADD CONSTRAINT "GrantPartnerUser_orgId_fkey"
    FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 4. Every org name is an alias of itself ─────────────────────────────────
-- So one lookup path resolves both canonical names and the variants added later.
INSERT INTO "OrgAlias" ("id", "orgId", "alias", "normalized", "source")
SELECT
    'oa_' || substr(md5(gen_random_uuid()::text), 1, 20),
    o."id",
    o."name",
    regexp_replace(lower(o."name"), '[^a-z0-9]', '', 'g'),
    'Org.name'
FROM "Org" o
WHERE o."kind" = 'partner'
  AND regexp_replace(lower(o."name"), '[^a-z0-9]', '', 'g') <> ''
ON CONFLICT ("normalized") DO NOTHING;
