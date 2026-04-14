/**
 * Migration: convert NeedsDomain enum to DB-driven string config.
 *
 * Changes:
 *  1. Extend NeedsFormulaConfig with label, color, type, populationField, sortOrder, isActive
 *  2. Convert NeedsFormulaConfig.domain from enum → TEXT
 *  3. Convert Goal.needsDomain from enum → TEXT
 *  4. Drop the NeedsDomain enum
 *  5. Add existingYouthResourceCentres, existingElderlyCentres,
 *     existingPalliativeCareServices, existingReferralSystems to SettlementAssessment
 *  6. Seed all 11 domain records with full config
 */

import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('1. Adding new columns to NeedsFormulaConfig...');
    await client.query(`
      ALTER TABLE "NeedsFormulaConfig"
        ADD COLUMN IF NOT EXISTS "label"           TEXT,
        ADD COLUMN IF NOT EXISTS "color"           TEXT NOT NULL DEFAULT '#6b7280',
        ADD COLUMN IF NOT EXISTS "domainType"      TEXT NOT NULL DEFAULT 'count',
        ADD COLUMN IF NOT EXISTS "populationField" TEXT,
        ADD COLUMN IF NOT EXISTS "sortOrder"       INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "isActive"        BOOLEAN NOT NULL DEFAULT true;
    `);

    console.log('1b. Making NeedsFormulaConfig.denominator nullable (for boolean domain types)...');
    await client.query(`
      ALTER TABLE "NeedsFormulaConfig"
        ALTER COLUMN "denominator" DROP NOT NULL;
    `);

    console.log('2. Changing NeedsFormulaConfig.domain from enum to TEXT...');
    await client.query(`
      ALTER TABLE "NeedsFormulaConfig"
        ALTER COLUMN "domain" TYPE TEXT USING "domain"::TEXT;
    `);

    console.log('3. Changing Goal.needsDomain from enum to TEXT...');
    await client.query(`
      ALTER TABLE "Goal"
        ALTER COLUMN "needsDomain" TYPE TEXT USING "needsDomain"::TEXT;
    `);

    console.log('4. Dropping NeedsDomain enum...');
    await client.query(`DROP TYPE IF EXISTS "NeedsDomain";`);

    console.log('5. Adding new existing columns to SettlementAssessment...');
    await client.query(`
      ALTER TABLE "SettlementAssessment"
        ADD COLUMN IF NOT EXISTS "existingYouthResourceCentres"   INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "existingElderlyCentres"          INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "existingPalliativeCareServices"  INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "existingReferralSystems"         INTEGER NOT NULL DEFAULT 0;
    `);

    console.log('6. Seeding domain config (label, color, type, populationField, sortOrder)...');

    const domains = [
      { domain: 'Creche',               label: 'Crèche',                    color: '#ec4899', type: 'count',   pop: 'children6m3yr',  sort: 1,  denom: 20  },
      { domain: 'ChildrenCentre',        label: 'Children Centre',           color: '#f97316', type: 'count',   pop: 'children4to14',  sort: 2,  denom: 500 },
      { domain: 'YouthGroup',            label: 'Youth Group',               color: '#8b5cf6', type: 'count',   pop: 'youth15to21',    sort: 3,  denom: 30  },
      { domain: 'YouthResourceCentre',   label: 'Youth Resource Centre',     color: '#7c3aed', type: 'count',   pop: 'youth15to21',    sort: 4,  denom: 1500 },
      { domain: 'ElderlyKitchen',        label: 'Elderly Kitchen',           color: '#10b981', type: 'count',   pop: 'elderly60plus',  sort: 5,  denom: 50  },
      { domain: 'ElderlyCentre',         label: 'Elderly Centre',            color: '#059669', type: 'count',   pop: 'elderly60plus',  sort: 6,  denom: 1000 },
      { domain: 'PalliativeSupport',     label: 'Palliative Support',        color: '#6366f1', type: 'count',   pop: 'elderly60plus',  sort: 7,  denom: 100 },
      { domain: 'PalliativeCareService', label: 'Palliative Care Service',   color: '#4f46e5', type: 'boolean', pop: null,             sort: 8,  denom: null },
      { domain: 'ReferralSystem',        label: 'Referral System (Elderly)', color: '#0284c7', type: 'boolean', pop: null,             sort: 9,  denom: null },
      { domain: 'CommunityToilet',       label: 'Community Toilet',          color: '#0ea5e9', type: 'count',   pop: 'totalHouseholds',sort: 10, denom: 200 },
      { domain: 'WaterATM',              label: 'Water ATM',                 color: '#14b8a6', type: 'count',   pop: 'totalHouseholds',sort: 11, denom: 250 },
    ];

    for (const d of domains) {
      // Update existing rows; insert new ones
      await client.query(`
        INSERT INTO "NeedsFormulaConfig" ("domain", "denominator", "description", "updatedAt", "label", "color", "domainType", "populationField", "sortOrder", "isActive")
        VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, true)
        ON CONFLICT ("domain") DO UPDATE SET
          "label"           = EXCLUDED."label",
          "color"           = EXCLUDED."color",
          "domainType"      = EXCLUDED."domainType",
          "populationField" = EXCLUDED."populationField",
          "sortOrder"       = EXCLUDED."sortOrder",
          "denominator"     = COALESCE(EXCLUDED."denominator", "NeedsFormulaConfig"."denominator"),
          "updatedAt"       = NOW();
      `, [d.domain, d.denom, `${d.label} target formula`, d.label, d.color, d.type, d.pop, d.sort]);
    }

    await client.query('COMMIT');
    console.log('\n✓ Migration complete.');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed — rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
