// Runs `prisma migrate deploy` with retries. On Neon, the migrate advisory lock
// (pg_advisory_lock) has a fixed 10s acquire timeout; a cold/just-woken compute
// or a concurrent deploy can blow past it (P1002). The first attempt wakes the
// compute and (if it grabbed the lock) applies migrations; a retry then lands on
// a warm DB with a free lock. A genuine migration error still fails after all
// attempts. Idempotent — re-running when nothing is pending is a no-op.
import { execSync } from "node:child_process";

const ATTEMPTS = 4;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

for (let i = 1; i <= ATTEMPTS; i++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit" });
    process.exit(0);
  } catch {
    console.error(`[migrate-deploy] attempt ${i}/${ATTEMPTS} failed`);
    if (i === ATTEMPTS) process.exit(1);
    await delay(8000 * i); // 8s, 16s, 24s backoff — lets a cold compute wake
  }
}
