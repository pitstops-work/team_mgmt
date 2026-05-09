-- Convert BudgetDomain enum fields to plain TEXT
-- Safe migration: PostgreSQL stores enum values as strings internally

-- BudgetLine.domain (BudgetDomain? → String?)
ALTER TABLE "BudgetLine" ALTER COLUMN "domain" TYPE TEXT USING "domain"::TEXT;

-- CostRegistry.domain (BudgetDomain? → String?)
ALTER TABLE "CostRegistry" ALTER COLUMN "domain" TYPE TEXT USING "domain"::TEXT;

-- LineTemplate.domain (BudgetDomain? → String?)
ALTER TABLE "LineTemplate" ALTER COLUMN "domain" TYPE TEXT USING "domain"::TEXT;

-- Budget.domains (BudgetDomain[] → String[])
ALTER TABLE "Budget" ALTER COLUMN "domains" TYPE TEXT[] USING "domains"::TEXT[];

-- Drop the enum type (all references must be gone first)
DROP TYPE IF EXISTS "BudgetDomain";

-- Create BudgetDomainConfig table
CREATE TABLE IF NOT EXISTS "BudgetDomainConfig" (
  "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  "city"             TEXT NOT NULL DEFAULT 'Bangalore',
  "key"              TEXT NOT NULL,
  "label"            TEXT NOT NULL,
  "description"      TEXT,
  "position"         INTEGER NOT NULL DEFAULT 0,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "beneficiaryLabel" TEXT,
  "beneficiaryVar"   TEXT,
  "beneficiaryMult"  DOUBLE PRECISION NOT NULL DEFAULT 1,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetDomainConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BudgetDomainConfig_city_key_key"
  ON "BudgetDomainConfig"("city", "key");

CREATE INDEX IF NOT EXISTS "BudgetDomainConfig_city_position_idx"
  ON "BudgetDomainConfig"("city", "position");

-- Seed the 5 existing domains for Bangalore and Chennai
INSERT INTO "BudgetDomainConfig"
  ("id","city","key","label","description","position","isActive","beneficiaryLabel","beneficiaryVar","beneficiaryMult")
VALUES
  (gen_random_uuid()::TEXT,'Bangalore','Children','Children','CLCs, after-school, camps',0,true,'Children','nCLCs',100),
  (gen_random_uuid()::TEXT,'Bangalore','Youth','Youth','YRCs, Yuva Adda, sports',1,true,'Youth','nYRCs',200),
  (gen_random_uuid()::TEXT,'Bangalore','Elderly','Elderly + Community Kitchen','Day care, nutrition, community kitchen',2,true,'Elderly','nElderly',1),
  (gen_random_uuid()::TEXT,'Bangalore','WelfareRights','Welfare Rights','Entitlement & collectivization',3,true,'Households','nSettlements',150),
  (gen_random_uuid()::TEXT,'Bangalore','Creche','Creche','0–3 yr children, APF standard model',4,true,'Creche children','nCreches',20),
  (gen_random_uuid()::TEXT,'Chennai','Children','Children','CLCs, after-school, camps',0,true,'Children','nCLCs',100),
  (gen_random_uuid()::TEXT,'Chennai','Youth','Youth','YRCs, Yuva Adda, sports',1,true,'Youth','nYRCs',200),
  (gen_random_uuid()::TEXT,'Chennai','Elderly','Elderly + Community Kitchen','Day care, nutrition, community kitchen',2,true,'Elderly','nElderly',1),
  (gen_random_uuid()::TEXT,'Chennai','WelfareRights','Welfare Rights','Entitlement & collectivization',3,true,'Households','nSettlements',150),
  (gen_random_uuid()::TEXT,'Chennai','Creche','Creche','0–3 yr children, APF standard model',4,true,'Creche children','nCreches',20)
ON CONFLICT DO NOTHING;
