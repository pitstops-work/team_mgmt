// Wire the two community-toilet GoalTemplateDef rows into the rest of the
// platform (Field Coverage + facility map), symmetric to how water-atm is wired.
// Idempotent: safe to re-run.
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';

const sql = neon(process.env.DATABASE_URL);

// 1. Ensure FacilityLayerConfig row for community sanitation complexes exists
const existingLayer = await sql`SELECT id FROM "FacilityLayerConfig" WHERE "layerKey" = 'community_toilets'`;
if (existingLayer.length === 0) {
  await sql`
    INSERT INTO "FacilityLayerConfig" (id, "layerKey", label, color, "needsDomain", "sortOrder", "isActive", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, 'community_toilets', 'Community Sanitation Complex', '#f43f5e', 'CommunityToilet', 7, true, now(), now())
  `;
  console.log('INSERTED FacilityLayerConfig: community_toilets');
} else {
  console.log('SKIP FacilityLayerConfig: community_toilets already exists');
}

// 2. Wire the new-build template to the needs domain
await sql`UPDATE "GoalTemplateDef" SET "needsDomain" = 'CommunityToilet', "updatedAt" = now() WHERE slug = 'community-toilet'`;
console.log('WIRED community-toilet  →  needsDomain=CommunityToilet');

// 3. Wire the existing-variant to both the needs domain and the facility layer
await sql`UPDATE "GoalTemplateDef" SET "needsDomain" = 'CommunityToilet', "linkedFacilityLayerKey" = 'community_toilets', "updatedAt" = now() WHERE slug = 'community-toilet-existing'`;
console.log('WIRED community-toilet-existing  →  needsDomain=CommunityToilet, linkedFacilityLayerKey=community_toilets');

// 4. Print final state for verification
const after = await sql`SELECT slug, "needsDomain", "linkedFacilityLayerKey" FROM "GoalTemplateDef" WHERE slug LIKE 'community-toilet%' ORDER BY slug`;
console.log('\nFinal state:');
console.table(after);
