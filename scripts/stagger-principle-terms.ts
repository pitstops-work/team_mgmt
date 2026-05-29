/**
 * Stagger ownerTermStart / ownerTermEnd across the calendar for principle
 * pages, so all 12 (or however many) do not expire on the same day. See
 * Module 8 of the practice-documentation training.
 *
 * Strategy: 6-month windows, two-week offsets. With 12 principles that fills
 * the half-year cleanly. Each page's nextReviewDue is recomputed to half-term
 * (90d after the new ownerTermStart for default 6mo terms).
 *
 * Idempotent: a re-run with the same set of pages produces the same dates,
 * so it is safe to re-run any time the list of principle pages grows.
 *
 * Run:
 *   npx tsx scripts/stagger-principle-terms.ts          # dry run
 *   npx tsx scripts/stagger-principle-terms.ts --apply  # write
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DAY_MS = 24 * 60 * 60 * 1000;
const TERM_DAYS = 180;
const STAGGER_DAYS = 14;
const REVIEW_OFFSET_DAYS = 90;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

async function main() {
  const apply = process.argv.includes("--apply");

  // Pages sorted by slug — gives a stable, reproducible offset assignment.
  const principles = await prisma.wikiPage.findMany({
    where: { type: "principle", archivedAt: null, status: { not: "retired" } },
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, title: true, ownerTermStart: true, ownerTermEnd: true, nextReviewDue: true },
  });

  if (principles.length === 0) {
    console.log("No principle pages found. Nothing to do.");
    return;
  }

  // Anchor: today, midnight UTC. The slug-sort is stable so the stagger is
  // reproducible — re-running the script does not shuffle assignments.
  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);

  console.log(`Anchor: ${anchor.toISOString().slice(0, 10)}`);
  console.log(`Stagger: ${STAGGER_DAYS} days · Term: ${TERM_DAYS} days · Review offset: ${REVIEW_OFFSET_DAYS} days\n`);

  for (let i = 0; i < principles.length; i++) {
    const p = principles[i];
    const newTermStart = addDays(anchor, i * STAGGER_DAYS);
    const newTermEnd = addDays(newTermStart, TERM_DAYS);
    const newReview = addDays(newTermStart, REVIEW_OFFSET_DAYS);

    const same =
      p.ownerTermStart?.getTime() === newTermStart.getTime() &&
      p.ownerTermEnd?.getTime() === newTermEnd.getTime() &&
      p.nextReviewDue?.getTime() === newReview.getTime();

    console.log(
      `${same ? "no-op" : "UPDATE"}  ${p.slug.padEnd(48)}  start=${newTermStart.toISOString().slice(0, 10)}  end=${newTermEnd.toISOString().slice(0, 10)}  review=${newReview.toISOString().slice(0, 10)}`,
    );

    if (!apply || same) continue;
    await prisma.wikiPage.update({
      where: { id: p.id },
      data: {
        ownerTermStart: newTermStart,
        ownerTermEnd: newTermEnd,
        nextReviewDue: newReview,
      },
    });
  }

  console.log(`\n${apply ? "Applied." : "Dry run. Re-run with --apply to write."}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
