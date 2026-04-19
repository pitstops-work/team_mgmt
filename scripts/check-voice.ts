import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function main() {
  await client.connect();
  const res = await client.query(`SELECT body, "originalLang", translations FROM "Message" WHERE "msgType" = 'voice' ORDER BY "createdAt" DESC LIMIT 1`);
  const row = res.rows[0];
  console.log('originalLang:', row.originalLang);
  console.log('body:', row.body);
  console.log('translations keys:', Object.keys(row.translations ?? {}));
  Object.entries(row.translations ?? {}).forEach(([k,v]) => console.log(` ${k}:`, v));
  await client.end();
}
main();
