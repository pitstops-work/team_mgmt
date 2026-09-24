---
name: Recruitment — batch runs, recovery and re-homing
description: How server-owned scouting runs fail and recover, the duplicate-CV trap, the rehome tool, and how changes reach production
type: project
---

**CV files are not kept once candidates are on a desk.** The uploaded file lives in `recruitment/cv-tmp/` only until scouting is done. A single desk deletes it straight away; a batch run deletes all its CVs once, at the end, so a parked run stays resumable. What IS kept is the extracted text, as `cvText` on each candidate in `snapshotJson`, and every move or re-scout works from that. Unscouted temp CVs are never auto-deleted, because they're the only copy.

Multi-city scouting runs are owned by the server (`lib/recruitment/batchRunner.ts`). The browser only watches.

- One chunk of CVs per invocation, inside Vercel's 300s ceiling. Each chunk kicks the next (`/api/cron/recruitment-batch-drain`). The 5-minute cron and the batch page's status poll both restart a run whose lease went stale.
- **An attempt is counted when the lease is taken, not when a chunk fails.** A chunk killed at the 300s ceiling reports nothing. Counting only failures let a recovery run spin at 32/173 forever (2026-09-24). After 3 attempts the run parks, and the page offers "Carry on" / "Skip the CVs it's stuck on".
- **`recruitment/cv-tmp/` holds one copy of a CV per upload.** A pool re-uploaded after a failure is there several times, which is how 41 leftover CVs became 173. The orphan survey keeps one copy per APPRF code, and the runner skips any CV whose code is already on the desk.
- **A recovery run appends to a desk an earlier run made**, so that desk has the old `batchId`. The batch page also finds desks by the slugs in the run's plan.

`/recruitment/<desk-slug>/rehome` sorts an Unplaced desk by home state (one-off for "Seeding RPs — Unplaced"): UP → Ayodhya/Varanasi (nearer), north-east → Guwahati, Odisha → nearest Odisha JD city, Karnataka → Bangalore, everyone else stays. Plan first (nothing moves), recruiter edits picks, then a server chain re-scouts them onto the target desks via `moveCandidates` (scores and notes carried over).

**Shipping:** production (pitstops.work) deploys from `main` on Vercel. Vercel *preview* builds of `claude/*` branches fail, but production built fine, so a red preview is not a blocker by itself. The Claude GitHub App has to be installed on `pitstops-work` for pushes to work. Merge to `main` only after the user agrees.

**Why:** the stuck run cost a day of confusion, because "running" looked the same as "dead".
**How to apply:** any new long server job should count attempts when it takes its lease, persist its queue in the DB, and have the page that shows its progress restart it when it goes stale.
