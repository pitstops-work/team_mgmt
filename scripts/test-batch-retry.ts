/**
 * Self-test: a transient failure is retried three times, then parks.
 *
 *   npx tsx scripts/test-batch-retry.ts
 *
 * Same contract as test-batch-runner.ts — one throwaway run row, no model
 * calls, cleans up after itself.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const ok = (l: string, c: boolean, x = "") => console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? ` — ${x}` : ""}`);

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const R = await import("../lib/recruitment/batchRunner");

  // Shape-valid ref that cannot actually be read → a 5xx/thrown failure, the
  // transient class (model timeout, blob hiccup), not the recruiter's data.
  const cvs = [{ url: "https://x.public.blob.vercel-storage.com/recruitment/cv-tmp/ghost.pdf", name: "ghost.pdf" }];
  const { id } = await R.startBatchRun({
    title: "Retry selftest", date: "", jobId: null, context: "",
    desks: [{ key: "a", label: "Alpha", locationId: null, unplaced: true, cvs }],
    session: null,
  });

  for (let i = 1; i <= 3; i++) {
    const res = await R.drainOneChunk(id, null);
    const run = await prisma.recruitmentBatchRun.findUniqueOrThrow({ where: { id } });
    const last = i === 3;
    ok(`attempt ${i}: counted`, run.attempts === i, String(run.attempts));
    ok(`attempt ${i}: ${last ? "parks" : "stays running"}`, run.status === (last ? "failed" : "running"), run.status);
    ok(`attempt ${i}: ${last ? "stops" : "keeps"} the chain`, res.more === !last, String(res.more));
    ok(`attempt ${i}: ${last ? "no" : "a"} backoff before the next try`, res.retrying === !last, String(res.retrying));
  }
  const run = await prisma.recruitmentBatchRun.findUniqueOrThrow({ where: { id } });
  ok("the CVs are still held for a resume", R.readPlan(run).desks[0].cvs.length === 1);
  ok("resume resets the attempt count", (await R.resumeBatchRun(id, false)).ok
    && (await prisma.recruitmentBatchRun.findUniqueOrThrow({ where: { id } })).attempts === 0);

  await prisma.recruitmentBatchRun.delete({ where: { id } });
  console.log("cleaned up");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
