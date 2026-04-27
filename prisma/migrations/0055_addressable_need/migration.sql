-- AddressableNeed fields on SettlementAssessment
ALTER TABLE "SettlementAssessment"
  ADD COLUMN IF NOT EXISTS "addressableCreches"   INTEGER,
  ADD COLUMN IF NOT EXISTS "addressableToilets"   INTEGER,
  ADD COLUMN IF NOT EXISTS "toiletLandAvailable"  BOOLEAN,
  ADD COLUMN IF NOT EXISTS "toiletLandType"       TEXT,
  ADD COLUMN IF NOT EXISTS "addressableWaterATMs" INTEGER,
  ADD COLUMN IF NOT EXISTS "waterATMCurrentCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "waterATMFeasible"     BOOLEAN;

-- Addressable need snapshot on SettlementProfile
ALTER TABLE "SettlementProfile"
  ADD COLUMN IF NOT EXISTS "addressableCreches"   INTEGER,
  ADD COLUMN IF NOT EXISTS "addressableToilets"   INTEGER,
  ADD COLUMN IF NOT EXISTS "addressableWaterATMs" INTEGER;
