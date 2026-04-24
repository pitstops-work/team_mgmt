import path from "path";
import dotenv from "dotenv";
import { Client } from "pg";
dotenv.config({ path: path.join("/Users/vishnuharikumar/new_app", ".env.local") });
const DB_URL = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
const client = new Client({ connectionString: DB_URL });
async function main() {
  await client.connect();
  const res = await client.query(`SELECT COUNT(*) as cnt, array_agg(name ORDER BY "sortOrder") as names FROM "GoalTemplateDef" WHERE "isActive" = true`);
  console.log("Count:", res.rows[0].cnt);
  console.log("Names:", JSON.stringify(res.rows[0].names, null, 2));
  await client.end();
}
main().catch(console.error);
