/**
 * Re-home an Unplaced desk by home state — a one-off for the Seeding RPs run.
 *
 * The recovery run finished its leftover CVs into "Seeding RPs — Unplaced",
 * and most of those people do belong to a city the JD hires in; triage just
 * never saw them. The recruiter's rule for sorting them is by HOME STATE:
 *
 *   Uttar Pradesh      → Ayodhya or Varanasi, whichever is nearer
 *   North-east states  → Guwahati
 *   Odisha             → the nearest of the JD's Odisha cities
 *   Karnataka          → Bangalore
 *   anywhere else      → stays Unplaced
 *
 * Two steps, and the recruiter sees the first before the second happens:
 *
 *   1. plan  — one cheap text-only call per 25 candidates reads each person's
 *              home state off their stored CV text. The code, not the model,
 *              decides which cities that state may go to, so a model slip can
 *              only ever pick between cities the rule already allows.
 *   2. apply — each accepted move is stamped on the candidate (`rehomeTo`) and
 *              a server-side chain works through them, a few at a time per
 *              city, through moveCandidates — the same re-scout a manual move
 *              does, so each person is judged against the new city's context.
 *
 * The queue lives on the desk's own snapshot, so no new table: `rehomeTo` on a
 * candidate means "still to move", and `rehome.lockedAt` is a lease that stops
 * two workers moving the same people twice.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";
import { moveCandidates } from "@/lib/recruitment/moveCandidate";
import { readPlan } from "@/lib/recruitment/batchRunner";
import type { ScoutCandidate, ScoutDocData } from "@/lib/recruitment/renderDoc";

type SessionLike = { user?: { id?: string; name?: string | null } | null } | null;

/** Candidates per re-scout call. Below the batch runner's 8: every candidate here carries a full CV. */
const MOVE_CHUNK = 6;
/** Longer than a 300s step, so a slow worker is never raced. */
const LEASE_MS = 7 * 60 * 1000;
const CLASSIFY_CHUNK = 25;
const CLASSIFY_CHARS = 2_500;

const NORTH_EAST = ["Assam", "Arunachal Pradesh", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Tripura", "Sikkim"];
const STATES = [
  "Uttar Pradesh",
  "Odisha",
  "Karnataka",
  ...NORTH_EAST,
  "Bihar",
  "West Bengal",
  "Jharkhand",
  "Madhya Pradesh",
  "Uttarakhand",
  "Delhi",
  "Rajasthan",
  "Maharashtra",
  "Tamil Nadu",
  "Kerala",
  "Andhra Pradesh",
  "Telangana",
  "Chhattisgarh",
  "Other",
];

type City = { id: string; city: string; state: string | null };

const norm = (s: string | null | undefined) => (s || "").toLowerCase().replace(/[^a-z]/g, "");

/** The cities a home state may be moved to under the rule above. Empty = stays. */
function citiesForState(state: string | null, cities: City[]): City[] {
  const s = norm(state);
  const named = (...names: string[]) => cities.filter((c) => names.includes(norm(c.city)));
  if (s === "uttarpradesh") return named("ayodhya", "varanasi");
  if (NORTH_EAST.some((n) => norm(n) === s)) return named("guwahati");
  if (s === "odisha" || s === "orissa") return cities.filter((c) => ["odisha", "orissa"].includes(norm(c.state)));
  if (s === "karnataka") return named("bangalore", "bengaluru");
  return [];
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export type RehomeProposal = {
  candidateId: string;
  name: string;
  homeState: string | null;
  /** Town or district the call rests on, as read off the CV. */
  place: string | null;
  reason: string;
  /** Cities the rule allows for this state. Empty = stays on Unplaced. */
  options: City[];
  /** The pick among `options` — null when there are none, or the CV can't tell which. */
  toLocationId: string | null;
};

export type RehomePlan =
  | { ok: true; slug: string; title: string; cities: City[]; missing: string[]; proposals: RehomeProposal[] }
  | { ok: false; status: number; error: string };

async function loadDesk(slug: string) {
  return prisma.recruitmentScoutingDay.findUnique({
    where: { slug },
    include: { job: { include: { location: true, locations: { orderBy: { city: "asc" } } } } },
  });
}

/** A batch run still appending to this desk would race every write here. */
async function busyWithBatch(slug: string): Promise<boolean> {
  const live = await prisma.recruitmentBatchRun.findMany({ where: { status: "running" }, select: { planJson: true } });
  return live.some((r) => readPlan(r).desks.some((d) => d.slug === slug));
}

export async function planRehome(slug: string): Promise<RehomePlan> {
  const day = await loadDesk(slug);
  if (!day || !day.snapshotJson) return { ok: false, status: 404, error: "That desk doesn't exist." };
  if (!day.job) return { ok: false, status: 400, error: "This desk isn't linked to a JD, so it has no cities to move to." };
  if (await busyWithBatch(slug)) {
    return { ok: false, status: 409, error: "A scouting run is still adding CVs to this desk. Wait for it to finish, then come back." };
  }

  const cities: City[] = (day.job.locations.length > 0 ? day.job.locations : [day.job.location]).map((l) => ({
    id: l.id,
    city: l.city,
    state: l.state,
  }));
  const missing = [
    ["Ayodhya or Varanasi", citiesForState("Uttar Pradesh", cities)],
    ["Guwahati", citiesForState("Assam", cities)],
    ["an Odisha city", citiesForState("Odisha", cities)],
    ["Bangalore", citiesForState("Karnataka", cities)],
  ]
    .filter(([, list]) => (list as City[]).length === 0)
    .map(([label]) => label as string);

  const snap = day.snapshotJson as unknown as ScoutDocData;
  const people = snap.candidates;
  const reads = await classify(people);

  const proposals = people.map((c, i): RehomeProposal => {
    const r = reads[i];
    const options = citiesForState(r.homeState, cities);
    const pick = options.length === 1 ? options[0].id : resolveNearest(options, r.locationId);
    return {
      candidateId: c.id,
      name: c.name,
      homeState: r.homeState,
      place: r.place,
      reason: r.reason,
      options,
      toLocationId: pick,
    };
  });
  return { ok: true, slug, title: day.title, cities, missing, proposals };
}

type Read = { homeState: string | null; place: string | null; locationId: string | null; reason: string };

function evidence(c: ScoutCandidate): string {
  const text = (c.cvText || "").slice(0, CLASSIFY_CHARS);
  return [c.meta ? `Profile line: ${c.meta}` : null, text || (c.scout ? `Scout notes: ${c.scout}` : "(no CV text)")]
    .filter(Boolean)
    .join("\n");
}

async function classify(people: ScoutCandidate[]): Promise<Read[]> {
  const out: Read[] = people.map(() => ({ homeState: null, place: null, locationId: null, reason: "Not read." }));
  const client = new Anthropic();
  const system = `You read CVs of candidates in India and say which Indian STATE each one is from.

"From" means where they live now; if the CV gives no current address, their hometown / native place / permanent address; failing that, where they most recently studied or worked.

homeState must be exactly one of: ${STATES.map((s) => `"${s}"`).join(", ")}, or null if the CV genuinely doesn't say.

Also give "place": the town or district that decided it (null if none), and "nearest": for Uttar Pradesh only, which is geographically nearer to that place — "Ayodhya" or "Varanasi" (null if unclear); for Odisha only, the Odisha town nearest to them as written on the CV (null if unclear). reason: one short clause naming the evidence, max 90 characters.

Return ONLY JSON, no fences:
{"reads":[{"n":1,"homeState":"..."|null,"place":"..."|null,"nearest":"..."|null,"reason":"..."}]}`;

  const chunks: number[][] = [];
  for (let i = 0; i < people.length; i += CLASSIFY_CHUNK) {
    chunks.push(Array.from({ length: Math.min(CLASSIFY_CHUNK, people.length - i) }, (_, k) => i + k));
  }
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, chunks.length) }, async () => {
      for (;;) {
        const chunk = chunks[next++];
        if (!chunk) return;
        const user = chunk
          .map((idx, k) => `=== CV ${k + 1} of ${chunk.length}: ${people[idx].name} ===\n${evidence(people[idx])}`)
          .join("\n\n");
        try {
          const msg = await client.messages.create({
            model: "claude-opus-4-7",
            max_tokens: 8_000,
            system,
            messages: [{ role: "user", content: user }],
          });
          const raw = msg.content
            .filter((b): b is Anthropic.TextBlock => b.type === "text")
            .map((b) => b.text)
            .join("");
          const parsed = JSON.parse(raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "")) as {
            reads?: { n?: number; homeState?: string | null; place?: string | null; nearest?: string | null; reason?: string }[];
          };
          for (const r of parsed.reads ?? []) {
            const k = Number(r.n) - 1;
            if (!Number.isInteger(k) || k < 0 || k >= chunk.length) continue;
            const state = STATES.find((s) => norm(s) === norm(r.homeState)) ?? null;
            out[chunk[k]] = {
              homeState: state === "Other" ? null : state,
              place: r.place ? String(r.place).slice(0, 60) : null,
              locationId: r.nearest ? `name:${norm(r.nearest)}` : null,
              reason: String(r.reason || "").slice(0, 120) || "No reason given.",
            };
          }
        } catch (e) {
          console.error("[recruitment-rehome] classify chunk failed:", e instanceof Error ? e.message : e);
          for (const idx of chunk) out[idx] = { ...out[idx], reason: "Couldn't read this one — pick by hand." };
        }
      }
    }),
  );
  return out;
}

/**
 * The model names the nearer city ("name:varanasi"); swap that for the id of
 * the matching option. No match (an Odisha town that isn't a JD city, say)
 * leaves the pick to the recruiter.
 */
function resolveNearest(options: City[], nearest: string | null): string | null {
  if (!nearest?.startsWith("name:")) return null;
  const want = nearest.slice(5);
  return options.find((o) => norm(o.city) === want || want.includes(norm(o.city)))?.id ?? null;
}

// ── Apply ────────────────────────────────────────────────────────────────────

type RehomeCandidate = ScoutCandidate & { rehomeTo?: string };
type RehomeSnapshot = Omit<ScoutDocData, "candidates"> & {
  candidates: RehomeCandidate[];
  rehome?: { lockedAt?: string | null; tries?: number; errors?: { name: string; error: string }[] };
};

/** Queue the accepted moves on the desk. Refuses while a queue is already running. */
export async function queueRehome(
  slug: string,
  moves: { candidateId: string; toLocationId: string }[],
): Promise<{ ok: true; queued: number } | { ok: false; status: number; error: string }> {
  const day = await loadDesk(slug);
  if (!day || !day.snapshotJson || !day.job) return { ok: false, status: 404, error: "That desk doesn't exist." };
  if (await busyWithBatch(slug)) return { ok: false, status: 409, error: "A scouting run is still adding CVs to this desk." };
  const snap = day.snapshotJson as unknown as RehomeSnapshot;
  if (snap.candidates.some((c) => c.rehomeTo)) return { ok: false, status: 409, error: "Moves are already under way on this desk." };

  const allowed = new Set((day.job.locations.length > 0 ? day.job.locations : [day.job.location]).map((l) => l.id));
  const want = new Map(moves.filter((m) => allowed.has(m.toLocationId) && m.toLocationId !== day.locationId).map((m) => [m.candidateId, m.toLocationId]));
  let queued = 0;
  const candidates = snap.candidates.map((c) => {
    const to = want.get(c.id);
    if (!to) return c;
    queued++;
    return { ...c, rehomeTo: to };
  });
  if (queued === 0) return { ok: false, status: 400, error: "Nobody to move." };
  await prisma.recruitmentScoutingDay.update({
    where: { slug },
    data: { snapshotJson: { ...snap, candidates, rehome: { lockedAt: null, errors: [] } } as unknown as never },
  });
  return { ok: true, queued };
}

/** Take the desk's lease. Conditional in SQL, so two workers can't both win. */
async function claim(slug: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - LEASE_MS).toISOString();
  const now = new Date().toISOString();
  const n = await prisma.$executeRaw`
    UPDATE "RecruitmentScoutingDay"
    SET "snapshotJson" = jsonb_set("snapshotJson", '{rehome}',
          COALESCE("snapshotJson"->'rehome', '{}'::jsonb) || jsonb_build_object(
            'lockedAt', ${now}::text,
            -- Counted on TAKING the lease, so a step killed at the 300s
            -- ceiling (which reports nothing) still uses up a try.
            'tries', COALESCE(("snapshotJson"->'rehome'->>'tries')::int, 0) + 1))
    WHERE slug = ${slug}
      AND (("snapshotJson"->'rehome'->>'lockedAt') IS NULL OR ("snapshotJson"->'rehome'->>'lockedAt') < ${cutoff})
  `;
  return n > 0;
}

/** Tries at one group before it is dropped from the queue and reported. */
const MAX_TRIES = 3;

async function release(
  slug: string,
  failed: { ids: string[]; error: string } | null,
  keepTries = false,
): Promise<void> {
  const day = await prisma.recruitmentScoutingDay.findUnique({ where: { slug }, select: { snapshotJson: true } });
  if (!day) return;
  const snap = day.snapshotJson as unknown as RehomeSnapshot;
  const errors = [...(snap.rehome?.errors ?? [])];
  const candidates = snap.candidates.map((c) => {
    if (!failed || !failed.ids.includes(c.id)) return c;
    errors.push({ name: c.name, error: failed.error });
    // Off the queue, so one bad candidate can't stall everyone behind them.
    const { rehomeTo: _drop, ...rest } = c;
    void _drop;
    return rest;
  });
  await prisma.recruitmentScoutingDay.update({
    where: { slug },
    data: {
      snapshotJson: {
        ...snap,
        candidates,
        rehome: { lockedAt: null, errors, tries: keepTries ? snap.rehome?.tries ?? 0 : 0 },
      } as unknown as never,
    },
  });
}

/** Move one group (same city, up to MOVE_CHUNK people). Returns whether more are queued. */
export async function rehomeStep(slug: string, session: SessionLike): Promise<{ claimed: boolean; more: boolean }> {
  if (!(await claim(slug))) return { claimed: false, more: false };
  let failed: { ids: string[]; error: string } | null = null;
  let retry = false;
  const day = await prisma.recruitmentScoutingDay.findUnique({ where: { slug }, select: { snapshotJson: true } });
  const snap = day?.snapshotJson as unknown as RehomeSnapshot | undefined;
  const queue = (snap?.candidates ?? []).filter((c) => c.rehomeTo);
  if (queue.length === 0) {
    await release(slug, null);
    return { claimed: true, more: false };
  }
  const to = queue[0].rehomeTo!;
  const ids = queue.filter((c) => c.rehomeTo === to).slice(0, MOVE_CHUNK).map((c) => c.id);
  const tries = snap?.rehome?.tries ?? 1;
  if (tries > MAX_TRIES) {
    failed = { ids, error: `Didn't finish in ${MAX_TRIES} tries — move by hand.` };
  } else {
    try {
      const res = await moveCandidates(slug, ids, to, session);
      if (!res.ok) failed = { ids, error: res.error };
      else if (res.missed.length) failed = { ids: res.missed.map((m) => m.fromId), error: "The re-scout left them out — move by hand." };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[recruitment-rehome] step failed for ${slug}:`, msg);
      // A thrown error is usually infrastructure (a model timeout, say), so the
      // next step retries the same group, until the tries run out.
      if (tries >= MAX_TRIES) failed = { ids, error: msg };
      else retry = true;
    }
  }
  await release(slug, failed, retry);
  const after = await rehomeStatus(slug);
  return { claimed: true, more: after.pending > 0 };
}

export type RehomeStatus = {
  pending: number;
  pendingByCity: Record<string, number>;
  errors: { name: string; error: string }[];
  /** Nobody holds the lease and people are still queued — the chain broke. */
  stale: boolean;
};

export async function rehomeStatus(slug: string): Promise<RehomeStatus> {
  const day = await prisma.recruitmentScoutingDay.findUnique({ where: { slug }, select: { snapshotJson: true } });
  const snap = day?.snapshotJson as unknown as RehomeSnapshot | undefined;
  const queue = (snap?.candidates ?? []).filter((c) => c.rehomeTo);
  const pendingByCity: Record<string, number> = {};
  for (const c of queue) pendingByCity[c.rehomeTo!] = (pendingByCity[c.rehomeTo!] ?? 0) + 1;
  const lockedAt = snap?.rehome?.lockedAt ? Date.parse(snap.rehome.lockedAt) : 0;
  return {
    pending: queue.length,
    pendingByCity,
    errors: snap?.rehome?.errors ?? [],
    stale: queue.length > 0 && (!lockedAt || lockedAt < Date.now() - LEASE_MS),
  };
}

// ── Chaining ─────────────────────────────────────────────────────────────────

export function rehomeToken(slug: string): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev").update(`rehome:${slug}`).digest("hex");
}

export function rehomeTokenValid(slug: string, given: string | null): boolean {
  if (!given) return false;
  const want = Buffer.from(rehomeToken(slug));
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Hand the next group to a fresh invocation, so each gets its own 300s. */
export async function kickRehome(slug: string, origin: string): Promise<void> {
  try {
    await fetch(`${origin}/api/cron/recruitment-rehome`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${rehomeToken(slug)}` },
      body: JSON.stringify({ slug }),
    });
  } catch (e) {
    // The status poll restarts a broken chain; a failed kick only delays it.
    console.error(`[recruitment-rehome] kick failed for ${slug}:`, e instanceof Error ? e.message : e);
  }
}
