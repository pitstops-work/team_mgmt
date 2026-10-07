/**
 * SYSTEM prompt assembly for the /recruitment scouting-desk generator.
 *
 * Previously a single hardcoded string in `app/api/recruitment/generate/route.ts`
 * that baked in the NGO/urban-settlement framing, the football metaphor, and
 * the NGO-flavoured flag rubric. Now assembled per request from a JD + Location
 * pair so the same pipeline can serve any role in any city.
 *
 * Composition (in order): base voice → theme block → JD block → rubric block →
 * scrutinise block → axes rule → output schema. Rubric fields on the JD exist
 * from Phase 1 but the prompt still injects generic defaults — per-JD rubric
 * wiring is Phase 3. Same for lockedAxes.
 */

import type { RecruitmentJob } from "@/app/generated/prisma/client";

// ── Input types ──────────────────────────────────────────────────────────────

/**
 * A JD snapshot as it's frozen into a scouting day at generation time. Uses a
 * plain shape (not the Prisma row) so we can pass either the live JD or the
 * frozen snapshot without a mapping step. Mirrors the JSON we persist in
 * RecruitmentScoutingDay.jobSnapshotJson.
 */
/**
 * Output-token ceilings for the scouting calls.
 *
 * Sized from real desks: a rendered candidate costs ~830-1,540 output tokens
 * (measured across three live scouting days — the spread is pool size, since
 * the model writes proportionally more prose for a small pool). The original
 * 24,000 therefore fit only ~15-29 candidates, and a desk past that truncated
 * mid-JSON and came back as "Model returned unparseable output".
 *
 * claude-opus-4-7 allows up to 128K output tokens, but only on a STREAMING
 * request — which all three of these are (`messages.stream` + `finalMessage`).
 * 64,000 is the documented streaming default and covers ~40+ candidates in one
 * desk, well past any realistic single-city pool. Do NOT raise these on a
 * non-streaming call: that hits the SDK's HTTP timeout instead.
 */
export const SCOUT_MAX_TOKENS = 64_000;
/** Append returns only the NEW candidates plus the doc-level fields, so it
 *  needs far less room than a full pool. */
export const APPEND_MAX_TOKENS = 32_000;

export type JobSnapshot = {
  title: string;
  seniority: string | null;
  dayToDay: string;
  mustHaves: string[];
  niceToHaves: string[];
  hardDisqualifiers: string[];
  salaryBand: string | null;
  theme: "football" | "neutral";
  notes: string;
  redFlagRules: string[];
  yellowFlagRules: string[];
  scrutiniseFor: string[];
  lockedAxes: string[];
  location: {
    city: string;
    state: string | null;
    country: string;
    primaryLanguage: string | null;
    localReferenceOrgs: string[];
    localRedFlags: string[];
    mobilityDefault: string | null;
    notes: string;
  };
};

/**
 * Sentinel city for the "unplaced" desk — the candidates triage could not
 * assign to any of the JD's cities. jdBlock keys off this to drop every
 * location-specific instruction instead of silently borrowing another city's
 * context. Not a real location and never written to RecruitmentLocation; the
 * scouting day's `locationId` stays null for these desks.
 *
 * Plain ASCII, deliberately. This was briefly a control character to guarantee
 * it could never collide with a real city name — which made the snapshot
 * unstorable: Postgres JSONB rejects a NUL byte in a string, so generating an
 * unplaced desk ran the whole scouting call and then died on the write.
 * Double underscores are collision-proof enough for a city column.
 */
export const UNPLACED_CITY = "__UNPLACED__";

/** A snapshot for an unplaced pool: the JD, with no local context at all. */
export function jobSnapshotUnplaced(job: RecruitmentJob): JobSnapshot {
  return jobSnapshotFromRow(job, {
    city: UNPLACED_CITY,
    state: null,
    country: "",
    primaryLanguage: null,
    localReferenceOrgs: [],
    localRedFlags: [],
    mobilityDefault: null,
    notes: "",
  });
}

/**
 * Sentinel city for a desk whose ROLE HAS NO CITY — remote, national, or a
 * central team. jdBlock keys off this to judge purely on the role.
 *
 * NOT the same as UNPLACED_CITY above, and the difference is the whole point.
 * Unplaced means "we do not know which city yet", so that prompt ASKS the
 * model to hint at a city and the desk asks the recruiter to allocate each
 * person. This one means there is no city to know: no language, local-
 * organisation or travel assumptions, and nothing for anyone to allocate.
 * Collapsing the two would reintroduce exactly the nagging this removes.
 *
 * Plain ASCII and double-underscored, for the same reason as UNPLACED_CITY:
 * Postgres JSONB rejects a NUL byte in a string, so a control-character
 * sentinel made the snapshot unstorable and killed the write AFTER the whole
 * scouting call had run. Never put a control character in this value.
 */
export const NO_CITY = "__NO_CITY__";

/** The synthetic location for a role with no location. No local context at all. */
const NO_CITY_LOCATION: JobSnapshot["location"] = {
  city: NO_CITY,
  state: null,
  country: "",
  primaryLanguage: null,
  localReferenceOrgs: [],
  localRedFlags: [],
  mobilityDefault: null,
  notes: "",
};

/** A snapshot for a role that genuinely has no city. */
export function jobSnapshotNoCity(job: RecruitmentJob): JobSnapshot {
  return jobSnapshotFromRow(job, NO_CITY_LOCATION);
}

/**
 * Re-point an ALREADY FROZEN snapshot at "no city", keeping every other frozen
 * JD field as it was. Used when an existing desk is converted: rebuilding from
 * the live RecruitmentJob row would also drag in every JD edit made since the
 * desk was scouted, which is the one thing snapshot-on-use exists to prevent.
 */
export function snapshotWithNoCity(prior: JobSnapshot): JobSnapshot {
  return { ...prior, location: { ...NO_CITY_LOCATION } };
}

/**
 * Build a JobSnapshot from live Prisma rows — used at generation time.
 *
 * `location` is typed as the fields actually read rather than the full
 * RecruitmentLocation row, so a synthetic context (see jobSnapshotUnplaced)
 * can be passed without inventing ids and timestamps or casting through
 * `unknown`. A real Prisma row satisfies this structurally.
 */
export function jobSnapshotFromRow(
  job: RecruitmentJob,
  location: JobSnapshot["location"],
): JobSnapshot {
  return {
    title: job.title,
    seniority: job.seniority,
    dayToDay: job.dayToDay,
    mustHaves: job.mustHaves,
    niceToHaves: job.niceToHaves,
    hardDisqualifiers: job.hardDisqualifiers,
    salaryBand: job.salaryBand,
    theme: (job.theme === "neutral" ? "neutral" : "football"),
    notes: job.notes,
    redFlagRules: job.redFlagRules,
    yellowFlagRules: job.yellowFlagRules,
    scrutiniseFor: job.scrutiniseFor,
    lockedAxes: job.lockedAxes,
    location: {
      city: location.city,
      state: location.state,
      country: location.country,
      primaryLanguage: location.primaryLanguage,
      localReferenceOrgs: location.localReferenceOrgs,
      localRedFlags: location.localRedFlags,
      mobilityDefault: location.mobilityDefault,
      notes: location.notes,
    },
  };
}

// ── Prompt fragments ─────────────────────────────────────────────────────────

const BASE_VOICE = `You are a senior talent scout producing a "scouting desk" briefing for an interview day.

You will receive the role context and one CV per candidate (text extract, or page images for scanned CVs). Return ONLY a JSON object — no markdown fences, no commentary — matching the schema at the bottom of this prompt.`;

const THEME_FOOTBALL = `Voice: use a football-scouting metaphor throughout. Candidates are trialists, the role is a shirt, the hiring manager is the selector, the interview day is matchday, positional metaphors describe candidate profiles ("box-to-box grafter", "veteran captain · systems brain", "hyped academy prospect"). Witty but never at the expense of substance — every claim must be grounded in the CV evidence, and unverifiable or suspicious claims become flags, not jokes.`;

const THEME_NEUTRAL = `Voice: professional, direct, no metaphors. Same output structure. Every claim must be grounded in the CV evidence; unverifiable or suspicious claims become flags, not commentary.`;

/** Generic scrutinise-for baseline — always applied, JD may add more (Phase 3). */
const DEFAULT_SCRUTINISE = [
  "date overlaps between roles",
  "unexplained gaps",
  "designation inflation",
  "org-hopping patterns",
  "claims the CV can't substantiate",
];

/** Generic red-flag baseline. JD-supplied rules append (Phase 3). */
const DEFAULT_RED_FLAGS = [
  "unexplained gaps",
  "overlapping employment dates",
  "likely misrepresentation",
  "conflict-of-interest optics",
];

/** Generic yellow-flag baseline. JD-supplied rules append (Phase 3). */
const DEFAULT_YELLOW_FLAGS = [
  "relocation friction",
  "title inversion",
  "thin experience against role requirements",
  "retention risk",
];

const OUTPUT_SCHEMA = `Output schema (exact shape):

{
  "docTitle": string,        // browser tab title, e.g. "<Role> Trials · <City> — Scouting Day". Use the role and city from the role context above; if the location is undetermined, leave the city out entirely rather than inventing one.
  "matchday": string,        // e.g. "Matchday · Thu 30 July 2026" (use the interview date given)
  "titleA": string,          // headline line 1, e.g. "RP Trials"
  "titleB": string,          // headline line 2 — for football theme, a football-club twist on the team/city, e.g. "<City> Urban FC"; for neutral theme, a straightforward subtitle. If the location is undetermined, base it on the role, never on a guessed city.
  "sub": string,             // e.g. "8 trialists · 1 shirt · position: <b>Resource Person (box-to-box)</b>"
  "axes": [string x6],       // 6 radar axis labels, UPPERCASE, max 7 chars each
  "headlines": [string],     // 5–8 ticker headlines, UPPERCASE tabloid style, each surfacing a REAL cross-pool pattern or a candidate-specific alert
  "everyone": [string],      // 2–4 paragraphs of probes to put to EVERY candidate, each starting "<b>1. Name of test:</b> …". Derive from patterns across the pool
  "candidates": [
    {
      "id": string,          // kebab-case short id from the name
      "code": string,        // the application reference, VERBATIM and whole, from the CV header line or an "application ref:" note ("APPRF-0768" stays "APPRF-0768" — never shorten it, drop the prefix or strip leading zeros). Only if no reference is given anywhere: "01".."NN".
      "name": string,
      "pos": string,         // profile in a phrase (football-position metaphor if theme=football; a plain profile line otherwise)
      "meta": string,        // "~5 yrs · City · Highest qualification, Institution"
      "attrs": [number x6],  // 0–100 per axis, honest spread — do not cluster everyone at 60–80
      "flags": [["r"|"y", string]], // 1–3 flags. "r" = serious, "y" = caution. May use <b>.
      "scout": string,       // 60–110 word scout's report: what the evidence shows, strongest asset, core doubt. May use <b>. Reference concrete numbers/orgs from the CV.
      "qs": [string],        // 5 sharp interview questions, each anchored in something specific in THIS CV: verify suspicious claims first, then depth probes, then fit/practicals. May include a "PRE-WORK (internal): …" item.
      "cvIndex": number      // REQUIRED. The 1-based index of the CV this candidate came from (1..N, matching the "CV i of N: filename" markers in the user content).
    }
  ]
}

General rules:
- Order candidates from strongest to weakest overall read.
- The only HTML allowed anywhere is <b>…</b>.
- attrs must reflect the evidence: a candidate weak on a role-critical dimension scores low on that axis even if otherwise impressive.
- Questions are for the interviewer to read aloud — direct, specific, no filler.
- cvIndex must correctly identify which of the N input CVs each candidate came from; the server pairs the extracted CV text back onto the candidate row using it.`;

// ── Block builders ───────────────────────────────────────────────────────────

function themeBlock(theme: "football" | "neutral"): string {
  return theme === "football" ? THEME_FOOTBALL : THEME_NEUTRAL;
}

/**
 * The part of the role brief that is the same whatever the desk's location is.
 * Shared by all three jdBlock branches — a third verbatim copy would drift.
 * The selector's own notes are NOT here: they come last in every branch, after
 * whatever location material that branch adds.
 */
function roleBodyLines(job: JobSnapshot): string[] {
  const lines: string[] = [];
  if (job.salaryBand) lines.push(`Salary band: ${job.salaryBand}`);
  if (job.dayToDay.trim()) lines.push(`\nWhat the role does day-to-day:\n${job.dayToDay.trim()}`);
  if (job.mustHaves.length) lines.push(`\nMust-haves:\n${job.mustHaves.map((s) => `- ${s}`).join("\n")}`);
  if (job.niceToHaves.length) lines.push(`\nNice-to-haves:\n${job.niceToHaves.map((s) => `- ${s}`).join("\n")}`);
  if (job.hardDisqualifiers.length) {
    lines.push(`\nHard disqualifiers (instant no):\n${job.hardDisqualifiers.map((s) => `- ${s}`).join("\n")}`);
  }
  return lines;
}

function jdBlock(job: JobSnapshot): string {
  const loc = job.location;
  const locLine = [loc.city, loc.state, loc.country].filter(Boolean).join(", ");
  const selectorNotes = job.notes.trim() ? [`\nAdditional context from the selector:\n${job.notes.trim()}`] : [];

  // A role that genuinely has NO city — remote, national, a central team.
  // Nothing about location is missing here and nothing is going to be decided
  // later, which is what separates this from the UNPLACED branch below: that
  // one asks the model to hint at a city, this one must not raise location at
  // all. See NO_CITY.
  if (loc.city === NO_CITY) {
    const lines: string[] = [
      `Role: ${job.title}${job.seniority ? ` (${job.seniority})` : ""}`,
      `Location: NONE. This role is not tied to a city — it is remote, national, or part of a central team. There is no local context to judge against, and none is missing: there is no city, and no city is going to be decided later.`,
      `Judge every candidate on the role alone — the evidence in their CV, the depth of their experience, and their fit against the must-haves below.`,
      `Make NO assumptions about language, local organisations, regional networks, commuting, relocation or willingness to travel, and do not score anyone up or down for where they happen to live. If this role genuinely requires a language or travel, it is written in the role description below — judge against what is written there and nothing else.`,
      `Do NOT work out, guess or suggest which city anyone belongs to or could be posted to, and do not raise location as a question, a flag or a concern. Nobody on this desk is waiting to be allocated to a city.`,
      `In the "meta" field, give the candidate's own location ONLY if their CV states it outright, and never infer one. It is biographical: it must not influence the score, the flags or the questions.`,
      ...roleBodyLines(job),
      ...selectorNotes,
    ];
    return `Role context:\n${lines.join("\n")}`;
  }

  // An "unplaced" pool is the candidates triage could not assign to a city.
  // Their local context is genuinely unknown, so the prompt must say so rather
  // than let the model quietly assume the primary city's language and
  // reference orgs — the exact mistake single-city generation exists to avoid.
  if (loc.city === UNPLACED_CITY) {
    const lines: string[] = [
      `Role: ${job.title}${job.seniority ? ` (${job.seniority})` : ""}`,
      `Location: NOT YET DETERMINED. This role is hiring in several cities and these candidates could not be matched to one from their CV.`,
      `Judge them on the role itself — experience, evidence, depth. Do NOT assume any particular city's language, local organisations or travel expectations, and do not penalise a candidate for a location you cannot establish.`,
      `Where a CV does hint at a city or region, say so in the "meta" field — the recruiter is using this desk to work out where each of these people belongs.`,
      ...roleBodyLines(job),
      ...selectorNotes,
    ];
    return `Role context:\n${lines.join("\n")}`;
  }

  const lines: string[] = [
    `Role: ${job.title}${job.seniority ? ` (${job.seniority})` : ""}`,
    `Location: ${locLine}${loc.primaryLanguage ? ` · primary language: ${loc.primaryLanguage}` : ""}`,
  ];
  if (loc.mobilityDefault) lines.push(`Mobility expectation: ${loc.mobilityDefault}`);
  lines.push(...roleBodyLines(job));
  if (loc.localReferenceOrgs.length) {
    lines.push(`\nLocal reference orgs a serious candidate could plausibly cite:\n${loc.localReferenceOrgs.map((s) => `- ${s}`).join("\n")}`);
  }
  if (loc.notes.trim()) lines.push(`\nLocation context:\n${loc.notes.trim()}`);
  lines.push(...selectorNotes);
  return `Role context:\n${lines.join("\n")}`;
}

function rubricBlock(job: JobSnapshot): string {
  // Phase 1: JD-supplied rules append to defaults. Phase 3 will let JD rules
  // replace defaults per role (e.g. a startup engineer role that treats
  // org-hopping as a feature, not a red flag).
  const red = [...DEFAULT_RED_FLAGS, ...job.redFlagRules];
  // "relocation friction" is a location assumption. On a role with no city
  // there is nothing to relocate to, so offering it as a yellow flag invites
  // exactly the nag the no-city desk exists to remove. The UNPLACED desk keeps
  // it — there, where someone ends up IS the open question.
  const baseYellow =
    job.location.city === NO_CITY
      ? DEFAULT_YELLOW_FLAGS.filter((f) => f !== "relocation friction")
      : DEFAULT_YELLOW_FLAGS;
  const yellow = [...baseYellow, ...job.yellowFlagRules];
  return [
    "Flag rubric:",
    `- "r" (red / serious): ${red.join("; ")}`,
    `- "y" (yellow / caution): ${yellow.join("; ")}`,
    "1–3 flags per candidate, drawn from the CV evidence.",
  ].join("\n");
}

function scrutiniseBlock(job: JobSnapshot): string {
  const items = [...DEFAULT_SCRUTINISE, ...job.scrutiniseFor, ...job.location.localRedFlags];
  return `Scrutinise every CV for: ${items.join("; ")}. These drive the flags and interview questions.`;
}

function axesRule(job: JobSnapshot): string {
  if (job.lockedAxes.length === 6) {
    // The JD named its axes explicitly — that instruction wins even if one of
    // them measures locality. The recruiter asked for it by hand.
    return `Radar axes: use EXACTLY these 6 in this order, UPPERCASE, max 7 chars each — ${job.lockedAxes.map((a) => `"${a}"`).join(", ")}. Score each candidate 0–100 per axis based on CV evidence.`;
  }
  // The stock example ends in "LOCAL", which on a role with no city invites an
  // axis scoring people on a locality that does not exist.
  if (job.location.city === NO_CITY) {
    return `Radar axes: pick 6 axis labels that best discriminate THIS pool for THIS role. UPPERCASE, max 7 chars each. Example shape (do not copy verbatim): ["FIELD","RANGE","DOCS","DEPTH","STABLE","FIT"]. No axis may measure locality, language fit or willingness to relocate — this role has no city. Score each candidate 0–100 per axis with an honest spread — do not cluster everyone at 60–80.`;
  }
  return `Radar axes: pick 6 axis labels that best discriminate THIS pool for THIS role. UPPERCASE, max 7 chars each. Example shape (do not copy verbatim): ["FIELD","RANGE","DOCS","DEPTH","STABLE","LOCAL"]. Score each candidate 0–100 per axis with an honest spread — do not cluster everyone at 60–80.`;
}

/**
 * Appended AFTER the output schema on a no-city desk.
 *
 * Both OUTPUT_SCHEMA and APPEND_OUTPUT_SCHEMA specify `"meta": "~5 yrs · City
 * · …"`, and both are emitted after jdBlock — so an instruction that lives
 * only in jdBlock loses to the schema on recency. These have to come last.
 */
const NO_CITY_OVERRIDES = `Location overrides — this role has no city. These beat anything above, including the schema notes:
- "docTitle": the role only, e.g. "<Role> Trials — Scouting Day". No city, no region, and do not invent "(Remote)".
- "titleB": base it on the role or the team. Never on a city, and never on a guessed place.
- "meta": the format here is "~5 yrs · Highest qualification, Institution". Include a city only if the CV states one outright; never infer one, and never write "location unclear", "city not stated" or anything similar.
- Never flag, question or comment on location, relocation, travel willingness or language fit unless the role description above explicitly asks for it.
- No candidate on this desk is waiting to be assigned to a city. Do not say or imply that anyone needs one.`;

/** The overrides, or nothing — spread into a builder's line list. */
function noCityOverrides(job: JobSnapshot): string[] {
  return job.location.city === NO_CITY ? ["", NO_CITY_OVERRIDES] : [];
}

// ── Public builder ───────────────────────────────────────────────────────────

/** Assemble the full SYSTEM prompt for a scouting-day generation. */
export function buildSystemPrompt(job: JobSnapshot): string {
  return [
    BASE_VOICE,
    "",
    themeBlock(job.theme),
    "",
    jdBlock(job),
    "",
    rubricBlock(job),
    "",
    scrutiniseBlock(job),
    "",
    axesRule(job),
    "",
    OUTPUT_SCHEMA,
    ...noCityOverrides(job),
  ].join("\n");
}

// ── Append-CVs mode ──────────────────────────────────────────────────────────

const APPEND_BASE_VOICE = `You are a senior talent scout EXTENDING an existing scouting-day pool with additional CVs. The recruiter has already scouted an initial pool; your job is to score the new candidates on the SAME axes and rubric as the original pool so they slot in cleanly beside the existing entries.

You will receive the role context, the axes and rubric already in play, one-line summaries of the existing candidates for calibration, and the new CVs (text extract, or page images for scanned CVs). Return ONLY a JSON object — no markdown fences, no commentary — matching the schema at the bottom of this prompt.`;

const APPEND_OUTPUT_SCHEMA = `Output schema (exact shape — only new candidates, no headlines/everyone/axes):

{
  "candidates": [
    {
      "id": string,          // kebab-case short id from the name; MUST be unique from every existing-candidate id supplied above
      "code": string,        // the application reference, VERBATIM and whole, from the CV header line or an "application ref:" note ("APPRF-0768" stays "APPRF-0768" — never shorten it, drop the prefix or strip leading zeros). Only if no reference is given anywhere: the next number after the existing pool. Never renumber a person who has one — it is how the applicant system knows them.
      "name": string,
      "pos": string,         // profile phrase (football-position metaphor if theme=football; plain profile line otherwise)
      "meta": string,        // "~5 yrs · City · Highest qualification, Institution"
      "attrs": [number x6],  // 0–100 per FIXED axis (see axes rule above). Do NOT reinterpret the axes.
      "flags": [["r"|"y", string]], // 1–3 flags. May use <b>.
      "scout": string,       // 60–110 word scout's report. May use <b>.
      "qs": [string],        // 5 sharp interview questions, each anchored in something specific in THIS CV.
      "cvIndex": number      // REQUIRED. 1-based index of the NEW CV this candidate came from (1..N of the "NEW CV i of N" markers above).
    }
  ]
}

Rules:
- Score consistently with the existing pool — a candidate matching the strongest existing profile should score similarly, not automatically top the pool.
- ids MUST be unique from the existing ones; add a suffix if a name collides.
- The only HTML allowed anywhere is <b>…</b>.
- cvIndex must identify which NEW CV each candidate came from; the server uses it to attach the extracted text to the candidate row.`;

/**
 * Append-mode SYSTEM prompt. Reuses the JD + rubric + scrutinise blocks so
 * scoring stays consistent with the original pool. Axes are locked to the
 * doc's existing axes regardless of the JD's lockedAxes field.
 */
export function buildAppendSystemPrompt(
  job: JobSnapshot,
  existingAxes: string[],
  existingCandidateSummaries: string[],
): string {
  const axesLine = `Fixed radar axes (locked from the original pool): ${existingAxes.map((a) => `"${a}"`).join(", ")}. Score each new candidate 0–100 on each axis with an honest spread. Do not invent new axes.`;
  const poolLine = existingCandidateSummaries.length
    ? `Existing pool (${existingCandidateSummaries.length} candidates already scouted — DO NOT re-score, only calibrate against):\n${existingCandidateSummaries.map((s) => `- ${s}`).join("\n")}`
    : "No existing candidates in the pool yet.";
  return [
    APPEND_BASE_VOICE,
    "",
    themeBlock(job.theme),
    "",
    jdBlock(job),
    "",
    rubricBlock(job),
    "",
    scrutiniseBlock(job),
    "",
    axesLine,
    "",
    poolLine,
    "",
    APPEND_OUTPUT_SCHEMA,
    ...noCityOverrides(job),
  ].join("\n");
}

// ── Regenerate mode ──────────────────────────────────────────────────────────

const REGENERATE_BASE_VOICE = `You are RE-SCOUTING an entire candidate pool. Some candidates come with fresh CVs (text/image blocks); others come with prior scout notes that describe them (treat those notes as the evidence about them — that's all we have on them).

Produce a fresh scouting doc reflecting the full pool: pick 6 axes that discriminate THIS pool, score everyone (both prior and new candidates) on those axes, write fresh headlines and "everyone" probes. Existing candidates carry an id you MUST reuse verbatim in your output (so the team's saved scores/notes stay linked). New candidates get fresh kebab-case ids.

Where a prior candidate's evidence is thin (only a short scout note, no CV), score conservatively and flag it — do not invent new details.`;

/**
 * Regenerate-mode SYSTEM prompt. Full doc refresh — axes/headlines/everyone
 * are all re-picked to reflect the full new pool. Existing candidate ids are
 * preserved for team-score continuity.
 */
export function buildRegenerateSystemPrompt(job: JobSnapshot): string {
  return [
    REGENERATE_BASE_VOICE,
    "",
    themeBlock(job.theme),
    "",
    jdBlock(job),
    "",
    rubricBlock(job),
    "",
    scrutiniseBlock(job),
    "",
    axesRule(job),
    "",
    OUTPUT_SCHEMA,
    ...noCityOverrides(job),
  ].join("\n");
}
