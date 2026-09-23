/**
 * Self-test for the batch runner's state machine.
 *
 *   npx tsx scripts/test-batch-runner.ts
 *
 * Safe to run against the live DB: it creates one run row with bogus CV refs,
 * drives it to completion and deletes it. No model calls, no blobs, no desks.
 *
 * (This repo has no test framework, so the runner's invariants — the ones
 * that were wrong in the browser-driven version — are checked here instead.)
 *
 * State-machine coverage — no model calls, no blobs.
 *
 * Drives a run whose CV refs are deliberately bogus so every chunk fails at
 * validation, which is enough to exercise claim/lease, error classification,
 * parking, resume, skip and finish.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const ok = (label: string, cond: boolean, extra = "") =>
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const R = await import("../lib/recruitment/batchRunner");

  const session = { user: { id: null as unknown as string, name: "Test Selector" } };
  const cv = (n: string) => ({ url: `https://not-our-store.example.com/${n}.pdf`, name: `${n}.pdf` });

  const { id } = await R.startBatchRun({
    title: "Runner selftest",
    date: "",
    jobId: null,
    context: "",
    desks: [
      { key: "a", label: "Alpha", locationId: null, unplaced: true, cvs: [cv("a1"), cv("a2"), cv("a3")] },
      { key: "b", label: "Beta", locationId: null, unplaced: true, cvs: [cv("b1")] },
    ],
    session: { user: { id: undefined, name: "Test" } } as never,
  });
  console.log("run", id);

  // 1. idempotent start
  const again = await R.startBatchRun({
    title: "Runner selftest", date: "", jobId: null, context: "", desks: [], session: null, id,
  });
  ok("second start with the same id is the same run", again.existed && again.id === id);

  // 2. the lease admits exactly one worker
  const [first, second] = await Promise.all([R.drainOneChunk(id, session as never), R.drainOneChunk(id, session as never)]);
  ok("only one of two racing drains claims the run", first.claimed !== second.claimed, `${first.claimed}/${second.claimed}`);

  // 3. a 4xx (bad CV ref) is terminal — no burning three attempts on it
  let run = await prisma.recruitmentBatchRun.findUniqueOrThrow({ where: { id } });
  ok("run parked as failed on a non-retryable error", run.status === "failed", run.status);
  ok("error names the desk", !!run.error?.startsWith("Alpha:"), run.error ?? "");
  ok("no progress recorded", R.readPlan(run).desks[0].done === 0);

  // 4. a failed run is not claimable — the cron must not pick it up
  const afterPark = await R.drainOneChunk(id, session as never);
  ok("a parked run refuses a drain", !afterPark.claimed);
  ok("sweep ignores parked runs", !(await R.findStaleRuns(50)).includes(id));

  // 5. resume + skip the stuck chunk
  const resumed = await R.resumeBatchRun(id, true);
  ok("resume reports what it skipped", resumed.ok && resumed.skipped === 3, String(resumed.skipped));
  run = await prisma.recruitmentBatchRun.findUniqueOrThrow({ where: { id } });
  ok("skipped CVs left the plan", R.readPlan(run).desks[0].cvs.length === 0);
  ok("totals stay honest after a skip", R.describeRun(run).totalCvs === 1, String(R.describeRun(run).totalCvs));
  ok("resume clears the error and reruns", run.status === "running" && run.error === null && run.attempts === 0);

  // 6. second desk fails the same way, then gets skipped, which finishes the run
  await R.drainOneChunk(id, session as never);
  run = await prisma.recruitmentBatchRun.findUniqueOrThrow({ where: { id } });
  ok("moved on to the next desk", !!run.error?.startsWith("Beta:"), run.error ?? "");
  await R.resumeBatchRun(id, true);
  const last = await R.drainOneChunk(id, session as never);
  run = await prisma.recruitmentBatchRun.findUniqueOrThrow({ where: { id } });
  ok("run with nothing left finishes", run.status === "done" && !last.more, run.status);
  ok("finish stamps a time and drops the lease", !!run.finishedAt && run.lockedAt === null);

  // 7. a finished run is inert
  ok("a done run refuses a drain", !(await R.drainOneChunk(id, session as never)).claimed);
  ok("a done run refuses a resume", !(await R.resumeBatchRun(id, false)).ok);

  // 8. drain tokens
  ok("drain token validates", R.drainTokenValid(id, R.drainToken(id)));
  ok("another run's token is rejected", !R.drainTokenValid(id, R.drainToken("bother")));
  ok("a garbage token is rejected", !R.drainTokenValid(id, "nope"));
  ok("client run ids are shape-checked", R.isRunId(id) && !R.isRunId("../x") && !R.isRunId(""));

  await prisma.recruitmentBatchRun.delete({ where: { id } });
  console.log("cleaned up");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
