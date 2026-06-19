-- Operating-model play surfaces.
--
-- Adds the three knobs the day-in-the-life "Operations" sim tab needs to coexist
-- with the existing 5-year finance model on one ModelInstance (one source of truth):
--
--   surface : "finance" | "sim" | "both" — which tab a group/node shows on.
--             Capex/inflation/NPV are finance-only; demand profile/cans/DEWATS are
--             sim-only; plant capacity/tank/price/HH are "both".
--   tier    : "basic" | "advanced" — sim-tab Basic/Advanced toggle. Engineering
--             constants (recovery rate, kWh/1000L) live in "advanced".
--   uiJson  : { min, max, step } — present → render a slider on the sim tab.
--
-- All additive with safe defaults, so existing rows keep today's behaviour
-- (everything "both" / "basic" / typed input).

ALTER TABLE "ModelGroup" ADD COLUMN "surface" TEXT NOT NULL DEFAULT 'both';

ALTER TABLE "ModelNode" ADD COLUMN "surface" TEXT NOT NULL DEFAULT 'both';
ALTER TABLE "ModelNode" ADD COLUMN "tier"    TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE "ModelNode" ADD COLUMN "uiJson"  JSONB;
