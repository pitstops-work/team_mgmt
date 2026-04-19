import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function main() {
  await client.connect();
  const res = await client.query(`SELECT id, email, "preferredLang" FROM "User" ORDER BY "createdAt" ASC LIMIT 5`);
  res.rows.forEach(r => console.log(r.email, '→', r.preferredLang));
  await client.end();
}
main();
