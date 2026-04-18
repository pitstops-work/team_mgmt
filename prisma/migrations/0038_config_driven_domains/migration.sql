-- Migration 0038: Make NeedsFormulaConfig fully self-describing.
--
-- Adds assessmentColumn (maps a domain to its legacy SettlementAssessment column)
-- and backfills populationField, assessmentColumn, label, color, sortOrder, domainType
-- for all 10 original domains so nothing stays hardcoded in application code.
--
-- COALESCE is used for label/color so that any values the admin already set via
-- the Settings UI are preserved.

ALTER TABLE "NeedsFormulaConfig"
  ADD COLUMN IF NOT EXISTS "assessmentColumn" TEXT;

-- ── Creche ────────────────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'children6m3yr',
  "assessmentColumn" = 'existingCreches',
  "label"            = COALESCE(NULLIF("label", ''), 'Creches'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#ec4899' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 10 ELSE "sortOrder" END
WHERE "domain" = 'Creche';

-- ── ChildrenCentre ────────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'children4to14',
  "assessmentColumn" = 'existingChildrenCentres',
  "label"            = COALESCE(NULLIF("label", ''), 'Children Centres'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#f97316' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 20 ELSE "sortOrder" END
WHERE "domain" = 'ChildrenCentre';

-- ── YouthGroup ────────────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'youth15to21',
  "assessmentColumn" = 'existingYouthGroups',
  "label"            = COALESCE(NULLIF("label", ''), 'Youth Groups'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#8b5cf6' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 30 ELSE "sortOrder" END
WHERE "domain" = 'YouthGroup';

-- ── YouthResourceCentre ───────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'youth15to21',
  "assessmentColumn" = NULL,
  "label"            = COALESCE(NULLIF("label", ''), 'Youth Resource Centres'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#7c3aed' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 40 ELSE "sortOrder" END
WHERE "domain" = 'YouthResourceCentre';

-- ── ElderlyKitchen ────────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'elderly60plus',
  "assessmentColumn" = 'existingElderlyKitchens',
  "label"            = COALESCE(NULLIF("label", ''), 'Elderly Kitchens'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#10b981' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 50 ELSE "sortOrder" END
WHERE "domain" = 'ElderlyKitchen';

-- ── ElderlyCentre ─────────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'elderly60plus',
  "assessmentColumn" = NULL,
  "label"            = COALESCE(NULLIF("label", ''), 'Elderly Centres'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#059669' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 60 ELSE "sortOrder" END
WHERE "domain" = 'ElderlyCentre';

-- ── PalliativeSupport ─────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'elderly60plus',
  "assessmentColumn" = 'existingPalliativeUnits',
  "label"            = COALESCE(NULLIF("label", ''), 'Palliative Support'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#6366f1' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 70 ELSE "sortOrder" END
WHERE "domain" = 'PalliativeSupport';

-- ── CommunityToilet ───────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'totalHouseholds',
  "assessmentColumn" = 'existingCommunityToilets',
  "label"            = COALESCE(NULLIF("label", ''), 'Community Toilets'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#0ea5e9' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 80 ELSE "sortOrder" END
WHERE "domain" = 'CommunityToilet';

-- ── WaterATM ──────────────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'totalHouseholds',
  "assessmentColumn" = 'existingWaterATMs',
  "label"            = COALESCE(NULLIF("label", ''), 'Water ATMs'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#14b8a6' ELSE "color" END,
  "domainType"       = 'count',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 90 ELSE "sortOrder" END
WHERE "domain" = 'WaterATM';

-- ── ReferralSystem ────────────────────────────────────────────────────────────
UPDATE "NeedsFormulaConfig" SET
  "populationField"  = 'elderly60plus',
  "assessmentColumn" = NULL,
  "label"            = COALESCE(NULLIF("label", ''), 'Referral System'),
  "color"            = CASE WHEN "color" = '#6b7280' THEN '#f59e0b' ELSE "color" END,
  "domainType"       = 'boolean',
  "sortOrder"        = CASE WHEN "sortOrder" = 0 THEN 100 ELSE "sortOrder" END
WHERE "domain" = 'ReferralSystem';
