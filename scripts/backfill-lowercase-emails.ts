/**
 * One-off cleanup: lowercase any stored user emails that contain uppercase.
 * Login is already case-insensitive (lib/auth.ts), so this is data hygiene, not
 * a functional fix. Skips a row if its lowercase form already belongs to
 * another user (would violate the unique email constraint).
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/backfill-lowercase-emails.ts
 */

import prisma from "../lib/prisma";

async function main() {
  const capped = (await prisma.user.findMany({ select: { id: true, email: true } }))
    .filter((u) => u.email !== u.email.toLowerCase());

  if (capped.length === 0) { console.log("No capped emails — nothing to do."); return; }

  for (const u of capped) {
    const lower = u.email.toLowerCase();
    const clash = await prisma.user.findFirst({ where: { email: lower, NOT: { id: u.id } } });
    if (clash) { console.log(`SKIP ${u.email} — lowercase already used by another user`); continue; }
    await prisma.user.update({ where: { id: u.id }, data: { email: lower } });
    console.log(`Updated: ${u.email} -> ${lower}`);
  }

  const remaining = (await prisma.user.findMany({ select: { email: true } }))
    .filter((u) => u.email !== u.email.toLowerCase()).length;
  console.log(`Done. Remaining capped emails: ${remaining}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
