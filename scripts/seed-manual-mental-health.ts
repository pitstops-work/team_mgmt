/**
 * Seed the Mental Health Support response module — the first manual in the
 * CO Response Manual. Also seeds three boundary-target stubs (Safety Pathway,
 * Caregiver Support, Health Referral) and three boundary edges, so the reader
 * can demonstrate the hands-off / draws-on map.
 *
 * Idempotent — upserts by slug. Re-running overwrites section content with
 * the canonical seed; stub modules are left alone if they already exist with
 * non-empty content (so future seeding of those modules is non-destructive).
 *
 * Source: docs/Response_Module_Mental_Health.docx (authored 2026-06-01).
 * Owner: kotlerster@gmail.com (Vishnu) — caller-supplied, matches the
 * principles seed convention.
 *
 * Run:
 *   npx tsx scripts/seed-manual-mental-health.ts          # dry run
 *   npx tsx scripts/seed-manual-mental-health.ts --apply  # write
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MANUAL_TYPE, SECTION_NUMBERS, type SectionNumber } from "../lib/wiki/manual";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const OWNER_EMAIL = "kotlerster@gmail.com";

const MENTAL_HEALTH_SLUG = "mental-health-support";
const SAFETY_PATHWAY_SLUG = "safety-pathway";
const CAREGIVER_SUPPORT_SLUG = "caregiver-support";
const HEALTH_REFERRAL_SLUG = "health-referral";

const MH_LEDE =
  "This module is one response in the CO Response Manual. It tells a Community Organiser what to do when an assessment raises a mental health concern — how to begin, how the standard path runs, how it differs by person, where it gets stuck, and when to break the standard. It is built on the shared eight-section module template.";

const MH_SENSITIVE_NOTE =
  "EVRAT Operational Guidelines, Section 20 — restricted handling. Mental health carries heavy stigma; nothing in this response is discussed with neighbours, other family members, or other COs except the supervisor.";

// All section content is markdown — same renderer as WikiPage.canonicalContent.
// PRACTICE CIRCLE INTAKE callouts are kept as blockquotes for now; the reader
// can later restyle them as amber zones.
const MH_SECTIONS: Record<SectionNumber, string> = {
  1: `Not "Q15a positive" or "depression flagged." The need as it actually presents at the doorway. Mental distress in elders is frequently not spoken as mental distress — the CO's first job is to recognise that several different doorway-presentations are the same underlying need.

### How it is actually said

> "I don't feel like getting up. There's nothing to get up for."
>
> "My son is gone. The house is empty. I just sit."
>
> "I don't sleep. I think about dying — not to do anything, I just think about it."
>
> "Nobody comes. Days pass and I don't speak to anyone."

Or no words at all — the CO observes flat affect, an elder who doesn't meet the eye, a room that has stopped being kept, food untouched.

### The same need wears different faces

- **The somatic mask** — "my body hurts everywhere," with no organic cause the elder can name. The distress has gone into the body.
- **The relational mask** — "I am a burden, you should not waste time on me."
- **Withdrawal** — the elder who has simply stopped: stopped cooking, stopped washing, stopped speaking.
- **Anger** — the elder who receives the CO's concern as an accusation and pushes back.

> **PRACTICE CIRCLE INTAKE** — Collect the real phrasings COs actually hear, in the actual languages — Kannada, Tamil, Urdu/Dakhni, Telugu. This list should hold fifty entries within a year, not five. Each phrasing a CO learns to recognise is one more elder caught earlier.`,

  2: `Mental health does not "close." Depression remits, recurs, remits. Closure here is not an endpoint — it is a maintained stable state with a monitoring cadence and an explicit rule for reopening.

### A response is working when ALL of these hold

- The elder has been seen by the clinical psychologist at the camp and has a plan — either a psychiatrist referral, or counselling plus an activity plan.
- **If psychiatrist referral:** the appointment has actually happened (not merely been given); medication, if prescribed, is being taken; and the elder has been followed up at home after the appointment.
- **If counselling plus activity plan:** the structured sessions are being attended, the activity plan is running at its intended cadence, and the elder is participating — not merely enrolled.
- The elder's own report and the CO's observation both show the distress is not worsening — ideally easing.
- A monitoring cadence is set and being kept.

### Re-trigger rule

Reopen immediately, regardless of apparent stability, if:

- any expression of wanting to die or to harm oneself (this also triggers the Safety Pathway — see Section 8),
- sudden withdrawal after a period of engagement,
- stopping medication,
- a major loss event — death of spouse, child migration, eviction,
- the caregiver reporting they can no longer cope.

Stability in mental health is always provisional. This module never reaches "closed and forgotten." At best it reaches "stable, monitored, low cadence."

### What does NOT count as done

The elder was taken to the camp once. A plan was made. A referral was given. These are steps, not closure. **This is the false-closure the module exists to prevent.**`,

  3: `The spine. The same for everyone; the particulars live in Sections 4–6.

### First: determine the speed by severity

| Severity | What it means | Speed |
| --- | --- | --- |
| **Severe** | Q15a = 3 (low mood nearly every day), critical flag, OR any mention of wanting to die | Supervisor contacted **SAME DAY**. Do not wait for the weekly camp. If any self-harm risk — trigger the Safety Pathway (Section 8). The CO never carries a possibly-suicidal elder alone for a week waiting for a camp slot. |
| **Moderate** | Q15a = 2, or Q15b = 2–3 | Route to the next weekly camp. The steps below apply. |

### The steps (moderate path)

1. **Flag and confirm with supervisor.** CO records the flag sensitively (restricted handling) and tells the supervisor. Supervisor confirms camp routing and notes the language need.
2. **Mark for the weekly camp at the elderly centre.** The default clinician is Kannada-speaking (serves ~80% of the population, fixed at the camp). If the elder's language is other than Kannada, the supervisor arranges for a clinician with the required language to be brought in for that elder. Language match is a precondition of the visit, not a hope — no elder is sent to a clinician they cannot speak with freely.
3. **Bring the elder to the camp.** This is not logistics — it is the relational hinge of the whole module. See Section 4.
4. **Clinician assesses and makes a plan** — either (a) psychiatrist referral, or (b) counselling plus activity plan. With the elder's consent, the CO is present for the handover so they know what they are now responsible for.
5. **CO executes the follow-through** — the branch point (below).
6. **Set the monitoring cadence and the re-trigger watch** (Section 2). Record. Continue.

### Step 5 — the two branches

| If the plan is… | The CO's responsibility is… |
| --- | --- |
| **(a) Psychiatrist referral** | Ensure the appointment actually happens — accompany the elder if needed; ensure medication is obtained and taken; conduct a home follow-up within 3 days after the appointment to check the medication is understood, being taken, and tolerated. |
| **(b) Counselling + activity plan** | The counselling is the clinical psychologist's own structured sessions (quality-assured — the CO does not deliver or improvise therapy). The CO's job is continuity and adherence: ensure the elder attends each scheduled session, the gap between sessions does not break the thread, and the activity plan runs between sessions. Activity plan delivered through the caregiver where one exists; where there is none, through the centre (see Section 5). |`,

  4: `The part no protocol contains, and the part that decides everything. For mental health, entering is harder than for almost any other need — the subject is stigmatised, often denied, and the elder may experience the CO's concern as accusation ("you think I am mad").

### Seeded openings (to be corrected and thickened by COs)

- **Never name it as mental illness at the doorway.** Words like *manasika* (mental) carry heavy stigma. Open about the feeling, not the diagnosis: "You seemed low when we last spoke. I have been thinking about you."
- **Sit down — lower than the elder if you can.** Mental distress in elders is bound up with loss of status and being talked down to. Placing yourself level or below signals you are not another authority come to manage them.
- **Introduce the camp as rest and talk, not treatment.** "There is a person at the centre who is very good to talk to. People feel lighter after. I will come with you." Not "there is a doctor for your condition."
- **The stigma is often the family's, not the elder's.** The hardest door is sometimes the son who does not want neighbours seeing his mother taken to a "mental camp." The CO may need to manage the family's fear before the elder's.
- **Watch for the somatic mask.** An elder who only speaks of body pain may be ready to be met there first — "the body carries the heart's weight too" — before any mention of mood.

> **PRACTICE CIRCLE INTAKE** — This section is deliberately thin and we know it. The real openings — the Kannada phrasings that work and the ones that backfire, the specific way COs have learned to sit with a withdrawn elder, the gestures, the silences, the patience — are what COs know and a manual cannot invent. This section should be the richest in the module within a year. Every CO who has successfully brought a reluctant, ashamed elder to that camp has knowledge that belongs here — attributed and dated.`,

  5: `Same flag, different elder. Seeded branches — designed to grow. Living arrangement is the biggest variable for this module.

### By living arrangement

| Situation | How the response shifts |
| --- | --- |
| **Willing caregiver present** | The plan is debriefed to the caregiver, who becomes the daily deliverer of the activity plan and the medication watch. The CO's role is to train and check the caregiver. Easiest path. |
| **Unwilling / stigma-resistant family** | The obstacle is the family, not the elder. Work shifts to family conversation — reducing shame, explaining that low mood is common and treatable, sometimes invoking a respected community member. The elder may want help the family will not allow. |
| **Lives alone, no caregiver** | The centre is the delivery mechanism — the CO brings the elder to the centre where the structured activity runs with others, which simultaneously treats the isolation often driving the depression. Settlement-level forums closer to home are the eventual aim but take time to build; until they exist, the centre is the route. Per-elder CO home-delivery is a last resort, not the default — the CO-load does not sustain it at scale, and the centre route treats the loneliness while the home route does not. |
| **Skip-generation (grandchildren only)** | The elder may be caregiver to children while themselves depressed. The activity plan must fit around their caregiving; grandchildren can be unexpectedly good allies in delivery. |

### By presentation

- **The somatic presenter** (all body, no mood): met through the body first; brief the clinician that the elder frames it physically.
- **The angry / resistant presenter:** refuses the camp, experiences concern as insult. Slower entering; may need several visits before consent.
- **The withdrawn / mute presenter:** cannot or will not articulate. The CO may need to be present at the camp and partly speak for the elder, with consent.

### By language

About 80% Kannada, served by the fixed camp clinician. For the remaining elders (Tamil, Urdu/Dakhni, Telugu, others), the supervisor brings in a clinician with the language for that elder's session. The rule is absolute: no elder is assessed by a clinician they cannot speak to freely. This is a scheduling task for the supervisor, not an obstacle for the CO.

> **PRACTICE CIRCLE INTAKE** — Every new "same need, different person" situation a CO meets files here. The branches above are a starting four or five; there will be twenty. When a context recurs across COs, it earns a standard approach.`,

  6: `The failure library. Seeded with anticipated stuck-points; the real ones — attributed, dated, located — come from COs. This is where the manual gets real.

### Anticipated stuck-points (to be confirmed or replaced by ground reality)

| Where it sticks | Seed note / what to try |
| --- | --- |
| **Psychiatrist referral given but appointment never happens** | Distance, cost, fear, no one to accompany. The single most likely closure failure. CO accompaniment works but is CO-time-expensive — this is exactly the load the resourcing calculator must absorb. |
| **Medication prescribed but not taken** | Cost, side effects frighten the elder, no one to remind, specific stigma about psychiatric drugs. Try: caregiver medication watch; addressing the specific fear; cost linkage. |
| **Activity plan runs two weeks, then dies** | Caregiver loses interest, elder loses interest, CO pulled to a crisis elsewhere. Sustaining is harder than starting. The centre route is more durable than home delivery. |
| **Family blocks the camp visit** | Fear of neighbours seeing. Work the family's stigma before the elder's; reframe the camp as rest and talk. |
| **Weekly camp cancelled / clinician absent** | The chain breaks at the centre, not the home. Supervisor must protect camp continuity; CO manages the elder's disappointment so trust is not lost. |
| **Elder attends once, feels no instant change, refuses to return** | Mismatch between expectation and the slow nature of recovery. Set the expectation early: this takes time; lightness comes gradually. |

> **PRACTICE CIRCLE INTAKE** — Each real entry should carry: settlement, CO name, rough date, what got stuck, what was tried, did it work. When five COs independently report the same stuck-point, the editor promotes it to a known branch in Section 5 with a standard approach. That promotion — from five anecdotes to one method — is the manual learning.`,

  7: `| When | What the CO checks |
| --- | --- |
| **Within 3 days of the camp** | Home visit: confirm the elder understood the plan; debrief the caregiver, or set the CO/centre delivery cadence if no caregiver. |
| **If psychiatrist referral** | Confirm appointment date; accompany or arrange accompaniment; within 3 days **after** the appointment, home visit to check medication obtained, understood, taken, tolerated. |
| **If counselling + activity plan** | At every routine visit, check the structured sessions are being attended and the activity plan is running at cadence. Watch participation, not just attendance. |

### Monitoring cadence by state

- **Active distress** — weekly.
- **Stabilising** — fortnightly.
- **Stable-maintained** — monthly, and never longer while a mental health flag is live in the record.

### Always on

The re-trigger watch (Section 2), regardless of cadence.

### Moving to stable-monitored

Requires: plan running, elder participating, distress not worsening for a sustained period (suggest 8 weeks) **AND** supervisor validation before reducing cadence (per Guidelines de-escalation rule).`,

  8: `The highest section, the last to fill, written only by experienced COs and supervisors. Where the manual stops being a protocol and becomes wisdom.

### Seeded openings

- **When the elder refuses the camp entirely and the refusal must be respected** — but the distress is real. Then: home-based relational presence by the CO, patience, the camp held open rather than forced. Forcing a stigmatised elder to a "mental camp" can deepen the wound.
- **When the activity plan matters more than the clinical plan** — for a lonely elder living alone, the daily contact and the centre may do more than any counselling protocol. The CO may legitimately weight centre attendance over strict session adherence.
- **When you suspect the diagnosis missed something** — an elder labelled "depression" who is actually in early dementia, or whose low mood is untreated pain, thyroid, or a medication side-effect. The CO who knows the elder over time may see what a single camp encounter missed, and should route back.

### The hard boundary: self-harm and suicide risk

When self-harm or suicide risk is present — any expression of wanting to die, any plan, any means — this **STOPS being a mental health module response** and triggers the **Safety Pathway** immediately. The CO does not attempt to manage suicide risk inside the mental health workflow, does not wait for the weekly camp, and does not carry it alone. The judgement the CO must hold is recognising the line between low mood and hopelessness (this module) and active self-harm risk (Safety Pathway). When in doubt, treat the line as crossed and escalate.

**Cross-reference:** Safety Pathway module. These two modules share a boundary and COs must be trained on exactly where it sits.

> **PRACTICE CIRCLE INTAKE** — This section fills slowest and is the most valuable. It is where the manual stops being a protocol and becomes wisdom. Reserve it for COs and supervisors who have walked the path many times.`,
};

type StubSeed = {
  slug: string;
  title: string;
  lede: string;
};

const STUBS: StubSeed[] = [
  {
    slug: SAFETY_PATHWAY_SLUG,
    title: "Safety Pathway",
    lede:
      "Stub — to be authored. Receives hand-offs from Mental Health Support whenever self-harm or suicide risk is present. The Safety Pathway is time-bound, supervisor-owned, and has a very different closure logic from a clinical-care module; it deserves its own 8-section build.",
  },
  {
    slug: CAREGIVER_SUPPORT_SLUG,
    title: "Caregiver Support",
    lede:
      "Stub — to be authored. Mental Health Support draws on this module when the activity plan is delivered through a caregiver who is themselves struggling (Q6b burnout).",
  },
  {
    slug: HEALTH_REFERRAL_SLUG,
    title: "Health Referral",
    lede:
      "Stub — to be authored. Mental Health Support draws on this module when low mood may be masking an organic cause (pain, thyroid, medication side-effect, early dementia).",
  },
];

type BoundarySeed = {
  fromSlug: string;
  toSlug: string;
  kind: "hands_off" | "draws_on";
  note: string;
};

const BOUNDARIES: BoundarySeed[] = [
  {
    fromSlug: MENTAL_HEALTH_SLUG,
    toSlug: SAFETY_PATHWAY_SLUG,
    kind: "hands_off",
    note: "Trigger: any expression of self-harm or suicide risk (see Section 8).",
  },
  {
    fromSlug: MENTAL_HEALTH_SLUG,
    toSlug: CAREGIVER_SUPPORT_SLUG,
    kind: "draws_on",
    note: "When activity plan is delivered through a caregiver who is themselves struggling.",
  },
  {
    fromSlug: MENTAL_HEALTH_SLUG,
    toSlug: HEALTH_REFERRAL_SLUG,
    kind: "draws_on",
    note: "When low mood may be masking an organic cause.",
  },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const now = new Date();
  const sixMonths = new Date(now); sixMonths.setMonth(sixMonths.getMonth() + 6);
  const threeMonths = new Date(now); threeMonths.setMonth(threeMonths.getMonth() + 3);

  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!owner) {
    console.error(`Owner not found: ${OWNER_EMAIL}`);
    process.exit(1);
  }

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  // ── 1. Mental Health Support — full manual ──────────────────────────────
  const existingMh = await prisma.wikiPage.findUnique({
    where: { slug: MENTAL_HEALTH_SLUG },
    select: { id: true, title: true, type: true },
  });
  console.log(`${existingMh ? "UPDATE" : "CREATE"}  page  ${MENTAL_HEALTH_SLUG}`);

  if (apply) {
    const mh = await prisma.wikiPage.upsert({
      where: { slug: MENTAL_HEALTH_SLUG },
      update: {
        title: "Mental Health Support",
        type: MANUAL_TYPE,
        maturity: "emerging",
        isSensitive: true,
        sensitiveNote: MH_SENSITIVE_NOTE,
        canonicalContent: MH_LEDE,
        ownerId: owner.id,
        lastEditedAt: now,
        lastEditedById: owner.id,
        status: "published",
      },
      create: {
        slug: MENTAL_HEALTH_SLUG,
        title: "Mental Health Support",
        type: MANUAL_TYPE,
        maturity: "emerging",
        isSensitive: true,
        sensitiveNote: MH_SENSITIVE_NOTE,
        canonicalLang: "en",
        canonicalContent: MH_LEDE,
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

    for (const n of SECTION_NUMBERS) {
      await prisma.wikiManualSection.upsert({
        where: { pageId_sectionNumber: { pageId: mh.id, sectionNumber: n } },
        update: { content: MH_SECTIONS[n], lastEditedAt: now, lastEditedById: owner.id },
        create: {
          pageId: mh.id, sectionNumber: n, content: MH_SECTIONS[n],
          lastEditedAt: now, lastEditedById: owner.id,
        },
      });
      console.log(`   section ${n}  (${MH_SECTIONS[n].length} chars)`);
    }
  } else {
    for (const n of SECTION_NUMBERS) {
      console.log(`   section ${n}  (${MH_SECTIONS[n].length} chars)`);
    }
  }

  // ── 2. Boundary-target stubs ────────────────────────────────────────────
  for (const stub of STUBS) {
    const existing = await prisma.wikiPage.findUnique({
      where: { slug: stub.slug },
      select: { id: true, canonicalContent: true },
    });
    // Don't clobber a real, non-stub module if it's been authored elsewhere.
    const skip = existing && existing.canonicalContent.length > stub.lede.length + 200;
    const action = !existing ? "CREATE" : skip ? "skip (looks authored)" : "UPDATE";
    console.log(`${action}  stub  ${stub.slug}`);
    if (!apply || skip) continue;

    await prisma.wikiPage.upsert({
      where: { slug: stub.slug },
      update: {
        title: stub.title,
        type: MANUAL_TYPE,
        maturity: "mostly_theory",
        canonicalContent: stub.lede,
        lastEditedAt: now,
        lastEditedById: owner.id,
      },
      create: {
        slug: stub.slug,
        title: stub.title,
        type: MANUAL_TYPE,
        maturity: "mostly_theory",
        canonicalLang: "en",
        canonicalContent: stub.lede,
        translatedContent: {},
        ownerId: owner.id,
        ownerTermStart: now,
        ownerTermEnd: sixMonths,
        nextReviewDue: threeMonths,
        lastReviewedAt: now,
        lastEditedAt: now,
        lastEditedById: owner.id,
        status: "draft",
      },
    });
  }

  // ── 3. Boundary edges ───────────────────────────────────────────────────
  for (const edge of BOUNDARIES) {
    const from = await prisma.wikiPage.findUnique({ where: { slug: edge.fromSlug }, select: { id: true } });
    const to = await prisma.wikiPage.findUnique({ where: { slug: edge.toSlug }, select: { id: true } });
    if (!apply) {
      console.log(`BOUNDARY  ${edge.fromSlug} --${edge.kind}--> ${edge.toSlug}`);
      continue;
    }
    if (!from || !to) {
      console.log(`SKIP boundary (missing page): ${edge.fromSlug} -> ${edge.toSlug}`);
      continue;
    }
    await prisma.wikiManualBoundary.upsert({
      where: {
        fromPageId_toPageId_kind: {
          fromPageId: from.id, toPageId: to.id, kind: edge.kind,
        },
      },
      update: { note: edge.note },
      create: { fromPageId: from.id, toPageId: to.id, kind: edge.kind, note: edge.note },
    });
    console.log(`BOUNDARY  ${edge.fromSlug} --${edge.kind}--> ${edge.toSlug}`);
  }

  console.log(`\n${apply ? "Applied." : "Dry run. Re-run with --apply to write."}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    prisma.$disconnect().finally(() => process.exit(1));
  });
