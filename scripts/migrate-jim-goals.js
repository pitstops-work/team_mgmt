/**
 * Migrates Jim Reeves Samuel's 22 standalone goals into a single
 * "Data/MIS Programme – Bangalore" goal with pitstops.
 * - Each old goal → a pitstop
 * - Old pitstops within those goals → checklist items (Done pitstops → checked)
 * - "Monthly data quality review" → Monthly recurrence
 * - Old goals soft-deleted after migration
 */
const { Client } = require('pg');
const { randomBytes } = require('crypto');

const DB = 'postgresql://neondb_owner:npg_YUQet8y5GWov@ep-lingering-waterfall-a1xc3pu6.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';
const JIM_ID   = 'cmnr4j09q000004l2a5yksydc';
const CITY_ID  = 'cmnstarnd000004jqlyvq7enc'; // Jim's Bangalore city

const cid = () => 'c' + randomBytes(12).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 23);

// Map old goal title → pitstop properties
const PITSTOP_META = {
  'Children - MIS':                                                    { type: 'Custom',          recurrence: 'None',    status: 'InProgress' },
  'Elderly - MIS':                                                     { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Youth - MIS':                                                       { type: 'Custom',          recurrence: 'None',    status: 'InProgress' },
  'Welfare and Entitlements - MIS':                                    { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'BUPSP app data accessibility for data dump':                        { type: 'Custom',          recurrence: 'None',    status: 'InProgress' },
  'Integration of all MIS systems':                                    { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Inventory management module':                                       { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Community collectives module':                                      { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Schools profile module':                                            { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Anganwadi profile module':                                          { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'BMI Tracking module':                                               { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Youth social action project module':                                { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Frappe settlements and administration mapping as per the organization': { type: 'Custom',      recurrence: 'None',    status: 'Upcoming'   },
  'Frappe user onboarding and configuring user credentials':           { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Frappe Wiki':                                                       { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Dashboard custom realtime reports':                                 { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Civic amenities mapping':                                           { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Identification of toilet requriements in South Zone':               { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Identification of Food distribution points in South Zone':          { type: 'Custom',          recurrence: 'None',    status: 'Upcoming'   },
  'Monthly data quality review and feedback':                          { type: 'Discussion',      recurrence: 'Monthly', status: 'Upcoming'   },
  'Collaboration and coordination with DI team':                       { type: 'Discussion',      recurrence: 'None',    status: 'Upcoming'   },
  'Collaboration and coordination with University team':               { type: 'Discussion',      recurrence: 'None',    status: 'Upcoming'   },
};

async function main() {
  const client = new Client({ connectionString: DB });
  await client.connect();

  // 1. Load Jim's goals with their pitstops
  const goalRows = await client.query(`
    SELECT g.id, g.title, g."targetDate"
    FROM "Goal" g
    WHERE g."ownerId" = $1 AND g."deletedAt" IS NULL
    ORDER BY g."updatedAt" DESC
  `, [JIM_ID]);

  const goals = goalRows.rows;
  console.log(`Found ${goals.length} goals for Jim`);

  // Load pitstops for each goal
  for (const g of goals) {
    const ps = await client.query(`
      SELECT p.id, p.title, p.status, p.type, p.recurrence, p."order"
      FROM "Pitstop" p
      WHERE p."goalId" = $1 AND p."deletedAt" IS NULL
      ORDER BY p."order"
    `, [g.id]);
    g.pitstops = ps.rows;
  }

  // 2. Create the overarching goal
  const overarchingId = cid();
  const targetDate = new Date('2027-03-31T18:30:00.000Z'); // end of FY
  await client.query(`
    INSERT INTO "Goal" (id, title, description, status, recurrence, "targetDate", "ownerId", "needsDomain", "needsCityId", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, 'Active', 'None', $4, $5, 'DataMIS', $6, NOW(), NOW())
  `, [
    overarchingId,
    'Data/MIS Programme – Bangalore',
    'Bangalore data and MIS operations — field apps, Frappe modules, data quality, and system integration.',
    targetDate,
    JIM_ID,
    CITY_ID,
  ]);
  console.log(`Created overarching goal: ${overarchingId}`);

  // Also add Jim as a follower of his own goal
  await client.query(`
    INSERT INTO "GoalFollow" (id, "userId", "goalId", "createdAt")
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT DO NOTHING
  `, [cid(), JIM_ID, overarchingId]);

  // 3. Create pitstops from old goals
  let order = 0;
  for (const g of goals) {
    const meta = PITSTOP_META[g.title] ?? { type: 'Custom', recurrence: 'None', status: 'Upcoming' };
    const pitstopId = cid();

    await client.query(`
      INSERT INTO "Pitstop" (id, title, type, "customType", status, priority, recurrence, "goalId", "ownerId", "ownerInherited", "order", "targetDate", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, NULL, $4, 'Medium', $5, $6, $7, true, $8, $9, NOW(), NOW())
    `, [
      pitstopId,
      g.title,
      meta.type,
      meta.status,
      meta.recurrence,
      overarchingId,
      JIM_ID,
      order++,
      g.targetDate,
    ]);

    // 4. Old pitstops → checklist items
    if (g.pitstops.length > 0) {
      for (let i = 0; i < g.pitstops.length; i++) {
        const p = g.pitstops[i];
        await client.query(`
          INSERT INTO "ChecklistItem" (id, text, checked, "pitstopId", "order", "createdAt")
          VALUES ($1, $2, $3, $4, $5, NOW())
        `, [
          cid(),
          p.title,
          p.status === 'Done',
          pitstopId,
          i,
        ]);
      }
    }

    console.log(`  → Pitstop: "${g.title}" [${meta.status}/${meta.recurrence}] + ${g.pitstops.length} checklist items`);
  }

  // 5. Soft-delete the old goals
  const oldIds = goals.map(g => g.id);
  await client.query(`
    UPDATE "Goal" SET "deletedAt" = NOW(), "updatedAt" = NOW()
    WHERE id = ANY($1)
  `, [oldIds]);
  console.log(`\nSoft-deleted ${oldIds.length} old goals`);

  console.log(`\nDone. Overarching goal ID: ${overarchingId}`);
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
