-- Free-text derivation ("how we arrived at this rate") for registry items that
-- don't decompose into components. Complements CostRegistryComponent.
ALTER TABLE "CostRegistry" ADD COLUMN "derivation" TEXT;
