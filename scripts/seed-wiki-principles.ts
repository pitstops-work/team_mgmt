/**
 * Seed the 12 working principles into the wiki module.
 *
 * Idempotent — upserts by slug. Existing duplicates (one-the-objective,
 * two-how-we-figure-out-what-to-do) are overwritten with identical English
 * content, so existing translations on those two rows survive untouched.
 * New rows (three..twelve) get empty translatedContent for later UI/translate.
 *
 * Owner: kotlerster@gmail.com (Vishnu) — caller-supplied.
 * Status: published. Owner term 6mo from today, next review 3mo from today.
 *
 * Run:
 *   npx tsx scripts/seed-wiki-principles.ts          # dry run (list intent)
 *   npx tsx scripts/seed-wiki-principles.ts --apply  # write
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const OWNER_EMAIL = "kotlerster@gmail.com";

type PrincipleSeed = {
  slug: string;
  title: string;
  // statement = the H2 line, body = paragraphs after it
  statement: string;
  body: string;
};

// English source text, lifted verbatim from the principles draft.
// Curly apostrophes match the style already present on rows 1 & 2.
const PRINCIPLES: PrincipleSeed[] = [
  {
    slug: "one-the-objective",
    title: "One — The objective",
    statement: "We exist to support the most vulnerable communities in this country.",
    body: `That is the whole sentence. There are no clauses about systems change, scale, or transformation. When two needs compete, the one closer to vulnerability wins. When two settlements compete, the one with weaker external attention wins. When two interventions compete, the one closer to a household’s daily survival wins.

If you ever feel lost about what we are doing, this line is the one to come back to. Most decisions resolve themselves the moment you put it at the top.`,
  },
  {
    slug: "two-how-we-figure-out-what-to-do",
    title: "Two — How we figure out what to do",
    statement:
      "We do three things, in order. Identify the need by walking the settlement and talking to households — without a solution already in our bag. Honestly assess whether we have the capacity to address it — partner, team, method, money. Then go after it. Plan it, sequence it, run it, visit it, course-correct it.",
    body: `That is the whole loop. It is not a theory of change. It is not a logic model. It is common sense, held against the temptation of more impressive frameworks.

If a programme skips step one, pretends step two, or stops at step three — it is not our work. It may be someone’s work. It is not ours.`,
  },
  {
    slug: "three-what-we-are-not-for",
    title: "Three — What we are not for",
    statement: "Equally important. The drift happens here.",
    body: `We are not doing preventive work. Awareness, behaviour change, prevention before harm happens — almost always a way to look busy without committing to a visible outcome. We work where the harm is already in the household.

We are not doing advocacy work. Lobbying, position papers, policy submissions, conference statements. These matter for someone. Not for us. The most vulnerable cannot wait for a policy cycle. We meet them where they live.

We are not doing larger-than-life programmes. National rollouts, replication strategies, scaling models before they have run well in one place. We are suspicious of any plan that needs a slide on replication before it has had its second cohort.

We are not working at a distance from the community. If the work can be done from a dashboard, an MIS report, or a quarterly review — it is not our work. The closer the eye, the better the work. Distance is failure.

If you find yourself drifting into any of these, you are working for someone else.`,
  },
  {
    slug: "four-rigour",
    title: "Four — Rigour",
    statement:
      "Rigour is the discipline this work runs on. It is the hardest thing to hold and the easiest thing to lose.",
    body: `A visit has a date. The date is held. If the date slips, there is a reason in writing and a new date — not “we’ll get to it.”

A checklist item is either done or not. “Mostly done” is not a status. If we say it is done, someone can walk in tomorrow and see it.

A number on a report has a source. The source can be traced. If we cannot trace it, we do not put it in the report.

A meeting happens on the day it was promised. With the partner. With the settlement. With the team member. Calendars are not aspirational.

Rigour is not a quarterly review activity. It is what every day looks like.`,
  },
  {
    slug: "five-try-and-learn",
    title: "Five — Try and learn",
    statement: "Pick a small thing. Run it. Watch what breaks. Fix that. Move.",
    body: `We do not write forty-page strategies before we have run a cohort. We do not pre-design the perfect model. We do not wait for evidence-based best practice while six cohorts come and go.

A failed cycle that taught us something is more valuable than three planning offsites that decided nothing.

We are deeply sceptical of “models” — the way the sector packages its work for fundraising. Models are almost always retrofits, an honest mess cleaned up for a deck. We borrow specific working practices from anyone doing something we admire. We do not adopt their model wholesale. And we keep testing what we borrowed before we believe it.`,
  },
  {
    slug: "six-where-we-work",
    title: "Six — Where we work",
    statement: "Where the need is. Not where the panel is.",
    body: `We choose the settlement with no NGO presence over the settlement that already has three. The crèche running in an eight-by-eight foot room over the flagship centre. The household nobody is counting over the one in every survey.

We decline glamour projects, photo-op settlements, demonstration sites that everyone tours but nobody lives in. We decline programmes designed to be replicable before they have been done once.

When we have to choose between visible and necessary, we choose necessary. The visible work will find its own funding. The necessary work usually will not.`,
  },
  {
    slug: "seven-we-are-middlemen-and-we-are-powerful",
    title: "Seven — We are middlemen, and we are powerful",
    statement:
      "We are not an NGO. We are not a normal funder either. We sit between a state that has failed a household and a household that has been failed by it, and we move things across that gap with our own hands and our own resources.",
    body: `That is power. We have our own money. We decide where it goes. We decide which settlements get attention, which partners we work with, which families get enrolled. We decide who gets heard in meetings and who gets promoted on our team.

Many in our sector perform powerlessness. We are just facilitators. The community leads. We are allies, not actors. It sounds humble. It is not. It is a way of holding power without being accountable for it.

We say it plainly. Yes, we are middlemen. Yes, middlemen are needed. Yes, we have power. Yes, we will be accountable for it.

That sentence is harder to live than to say. But it is the foundation of everything else.`,
  },
  {
    slug: "eight-neither-rights-based-nor-service-delivery",
    title: "Eight — Neither rights-based nor service-delivery",
    statement:
      "The sector has spent forty years arguing about whether the right way to help is to demand from the state or to deliver services directly. Both sides are partly right. The argument has produced almost nothing for the vulnerable households who watch us argue and wait.",
    body: `We walk cleanly away from both sides. Not because we are above the debate, but because the choice itself is rigged.

Our work is a single act: we identify a need in a community and we try to address it in the best way available to us.

If addressing the need means demanding from the state — we will. Quietly. Concretely. For a specific household. Not as a campaign. Not from a stage.

If addressing the need means delivering a service ourselves — we will. Carefully. Frugally. While being honest that this is substitution, and substitution is fragile.

Neither camp. Both, when the situation calls for it. Neither, when it does not. The community decides, not the sector camp.`,
  },
  {
    slug: "nine-politeness-and-verification",
    title: "Nine — Politeness and verification",
    statement: "Both. Always. Picking one breaks something.",
    body: `What we owe every partner, every CO, every member of a community we work in: equal seating, equal address, equal tea. No talking down. No “sir / madam” from the partner and first names from us. Honour their constraints — they have rent to pay, children at home, a phone bill, a relative in hospital. Take their criticism seriously, especially when they are pointing at a flaw in our design. If we hear “yes sir” from a partner all the time, we are doing something wrong.

What we also owe the work: verification. The sector has real integrity problems — ghost beneficiaries, inflated headcounts, vendor kickbacks, bills that do not add up. Pretending it does not is its own dishonesty. If a number on a report cannot be traced, we ask — politely — to trace it. If it still cannot be traced, we do not pay against it. Quietly. Firmly. Without making a scene.

Politeness gives the partner dignity. Verification gives the work integrity. Both at the same time, or we have broken something.`,
  },
  {
    slug: "ten-frugality-is-alignment",
    title: "Ten — Frugality is alignment",
    statement:
      "A meal is thirty-six rupees. A crèche teacher’s monthly salary is twelve thousand rupees. A community group meeting costs fifteen hundred rupees. Hold these numbers in your head when you read any budget line. Express every expense in what it replaces — a two-lakh venue cost is five and a half thousand meals.",
    body: `If a senior person flies business and stays in a five-star, every partner staff member starts asking why their per-diem is four hundred and fifty rupees. If our office is plush, our equipment expensive, our travel luxurious — the entire moral case for “every rupee counts” collapses.

Frugality is not poverty cosplay. It is alignment. How we spend tells everyone around us what is normal.`,
  },
  {
    slug: "eleven-no-credit-no-branding-no-stage",
    title: "Eleven — No credit, no branding, no stage",
    statement: "Three things we have chosen to stay away from. Permanently.",
    body: `We do not take credit for partner work. If a partner ran the centre, the partner ran the centre. Our name does not need to be on the banner, the report cover, the impact deck, the LinkedIn post.

We do not brand. No T-shirts with our logo at community events. No “powered by” footers. The community does not need to know our name.

We do not go on stage. No conferences. No policy panels. No public speeches. When approached, we decline politely and go back to work.

The reward for good work is more good work — not visibility. The day visibility becomes the goal, we have stopped being who we are.`,
  },
  {
    slug: "twelve-we-will-be-judged",
    title: "Twelve — We will be judged",
    statement:
      "Every confident programme of the last fifty years has eventually faced its reckoning. The green revolution. The white revolution. The flagship NGO programmes that were celebrated, replicated, and are now being quietly revisited.",
    body: `Whatever we do confidently today will be re-read in twenty years. Some of it will hold up. Some of it will be embarrassing. We do not yet know which is which.

What we can do today: stay grounded, listen to the field, follow common sense and conscience, refuse to perform certainty we do not have. History can judge us later. The middlemen circus does not get to judge us now.`,
  },
];

function canonicalContent(p: PrincipleSeed): string {
  return `## ${p.statement}\n\n${p.body}`;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const owner = await prisma.user.findFirst({ where: { email: OWNER_EMAIL } });
  if (!owner) throw new Error(`Owner not found: ${OWNER_EMAIL}`);
  console.log(`Owner: ${owner.email} (${owner.id})`);

  const now = new Date();
  const sixMonths = new Date(now.getTime());
  sixMonths.setMonth(sixMonths.getMonth() + 6);
  const threeMonths = new Date(now.getTime());
  threeMonths.setMonth(threeMonths.getMonth() + 3);

  const existing = await prisma.wikiPage.findMany({
    where: { slug: { in: PRINCIPLES.map((p) => p.slug) } },
    select: { slug: true, canonicalContent: true, title: true, ownerId: true },
  });
  const existingBySlug = new Map(existing.map((e) => [e.slug, e]));

  for (const p of PRINCIPLES) {
    const content = canonicalContent(p);
    const prev = existingBySlug.get(p.slug);
    const exists = !!prev;
    const same = prev && prev.canonicalContent === content && prev.title === p.title && prev.ownerId === owner.id;
    const action = !exists ? "CREATE" : same ? "no-op" : "UPDATE";
    console.log(`  ${action}  ${p.slug}  —  ${p.title}`);

    if (!apply) continue;
    if (same) continue;

    await prisma.wikiPage.upsert({
      where: { slug: p.slug },
      update: {
        title: p.title,
        type: "principle",
        canonicalLang: "en",
        canonicalContent: content,
        ownerId: owner.id,
        lastEditedAt: now,
        lastEditedById: owner.id,
        status: "published",
        // leave translatedContent + review/term dates untouched for existing rows
      },
      create: {
        slug: p.slug,
        title: p.title,
        type: "principle",
        canonicalLang: "en",
        canonicalContent: content,
        translatedContent: {},
        ownerId: owner.id,
        ownerTermStart: now,
        ownerTermEnd: sixMonths,
        nextReviewDue: threeMonths,
        lastReviewedAt: now,
        lastEditedAt: now,
        lastEditedById: owner.id,
        status: "published",
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
