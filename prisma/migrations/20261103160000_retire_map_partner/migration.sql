-- Retire MapPartner, the fourth partner identity.
--
-- 20261103120000_partner_registry_on_org made Org the single partner identity.
-- Three legacy carriers survived it, all of them now redundant:
--
--   Settlement."partnerId"    → MapPartner. 270 rows set, and the admin API had
--                               already stopped writing it: 7 settlements had
--                               partnerOrgId and no partnerId.
--   LayerFeature."partner"    → free text ("CFAR Creches", "actionaid"). 40 rows
--                               set, every one resolving to the org already on
--                               the row.
--   MapPartner                → 13 rows, all 13 mirrored as Org(kind='partner'),
--                               referenced only by Settlement."partnerId".
--
-- The guards below are the point of this migration. Each one re-proves, against
-- whatever the database actually holds at deploy time, the claim that made the
-- drop safe when it was checked by hand. If any legacy value carries something
-- partnerOrgId does not, this migration fails and nothing is dropped — far
-- better than discovering it after the column is gone, since a dropped column
-- is not recoverable from the schema.

-- ── Guard 1: no settlement relies on the legacy FK alone ────────────────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM "Settlement"
     WHERE "partnerId" IS NOT NULL AND "partnerOrgId" IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION
          'retire MapPartner: % settlement(s) have a legacy partnerId but no partnerOrgId; backfill them first', n;
    END IF;
END $$;

-- ── Guard 2: where both are set, they mean the same partner ─────────────────
-- MapPartner.key is the same slug Org.mapKey holds (Org.slug as a fallback, for
-- the partners that never had a map layer of their own).
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n
      FROM "Settlement" s
      JOIN "MapPartner" mp ON mp."id" = s."partnerId"
      JOIN "Org" o         ON o."id" = s."partnerOrgId"
     WHERE lower(mp."key") <> lower(coalesce(o."mapKey", o."slug"));
    IF n > 0 THEN
        RAISE EXCEPTION
          'retire MapPartner: % settlement(s) disagree between partnerId and partnerOrgId; reconcile them first', n;
    END IF;
END $$;

-- ── Guard 3: no layer feature relies on the free-text partner alone ─────────
DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM "LayerFeature"
     WHERE "partner" IS NOT NULL AND "partnerOrgId" IS NULL;
    IF n > 0 THEN
        RAISE EXCEPTION
          'retire MapPartner: % layer feature(s) have free-text partner but no partnerOrgId; backfill them first', n;
    END IF;
END $$;

-- ── Drop ────────────────────────────────────────────────────────────────────
ALTER TABLE "Settlement" DROP CONSTRAINT IF EXISTS "Settlement_partnerId_fkey";
DROP INDEX IF EXISTS "Settlement_partnerId_idx";
ALTER TABLE "Settlement" DROP COLUMN "partnerId";

ALTER TABLE "LayerFeature" DROP COLUMN "partner";

DROP TABLE "MapPartner";
