-- Template identity on Pitstop and PitstopEvent.
-- Lets the template-sync engine match template "slots" to instance rows when
-- propagating template edits into existing goals.

ALTER TABLE "Pitstop" ADD COLUMN "templateSlug" TEXT;
ALTER TABLE "Pitstop" ADD COLUMN "templateKey"  TEXT;

ALTER TABLE "PitstopEvent" ADD COLUMN "templateKey" TEXT;

-- ── Backfill Pitstop.templateSlug ──────────────────────────────────────────
-- A pitstop's templateSlug = the templateSlug of its checklist items, when
-- they all came from one template. When checklist items disagree (mixed origins)
-- or none have a templateSlug, leave the pitstop's templateSlug NULL — sync
-- treats those as user-created.
UPDATE "Pitstop" p
SET "templateSlug" = sub."slug"
FROM (
  SELECT "pitstopId", MIN("templateSlug") AS "slug"
  FROM "ChecklistItem"
  WHERE "templateSlug" IS NOT NULL
  GROUP BY "pitstopId"
  HAVING COUNT(DISTINCT "templateSlug") = 1
) sub
WHERE p.id = sub."pitstopId" AND p."templateSlug" IS NULL;

-- ── Backfill Pitstop.templateKey ──────────────────────────────────────────
-- Slugified pitstop title — same algorithm as JS slugifyChecklistText:
-- lowercase, non-alphanumeric collapsed to '-', leading/trailing '-' stripped,
-- truncated at 80 chars. Only set for template-owned pitstops.
UPDATE "Pitstop"
SET "templateKey" = LEFT(
  REGEXP_REPLACE(
    REGEXP_REPLACE(LOWER(title), '[^a-z0-9]+', '-', 'g'),
    '^-+|-+$', '', 'g'
  ),
  80
)
WHERE "templateSlug" IS NOT NULL AND "templateKey" IS NULL;

-- ── Backfill PitstopEvent.templateKey ─────────────────────────────────────
-- Only for events whose parent ChecklistItem has a templateSlug (i.e. created
-- by template apply, not user-scheduled). Slugified from the event title.
UPDATE "PitstopEvent" e
SET "templateKey" = LEFT(
  REGEXP_REPLACE(
    REGEXP_REPLACE(LOWER(e.title), '[^a-z0-9]+', '-', 'g'),
    '^-+|-+$', '', 'g'
  ),
  80
)
FROM "ChecklistItem" ci
WHERE e."checklistItemId" = ci.id
  AND ci."templateSlug" IS NOT NULL
  AND e."templateKey" IS NULL;

-- Index for sync lookup: "find every pitstop instance of template X"
CREATE INDEX "Pitstop_templateSlug_idx" ON "Pitstop"("templateSlug");
