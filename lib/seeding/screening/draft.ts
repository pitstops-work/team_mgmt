/**
 * AI first read of an application.
 *
 * Claude reads the form answers, the statement of purpose and the CV against
 * the geography's rubric and proposes a 1–5 score per dimension, each with the
 * evidence it rests on. The draft is advice to the screener and is never a
 * decision: only a reviewer's own scores are recorded as a review, and the
 * decision buttons stay locked until the reviewer has scored every dimension.
 *
 * Drafts are worked by a server-side queue (aiStatus on the application):
 * a worker claims a few applications, drafts them in parallel, and hands the
 * rest to a fresh invocation, so each batch gets its own 300s. A cron sweep
 * restarts the chain if it breaks, and a lease on each application stops two
 * workers drafting the same one.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createHmac, timingSafeEqual } from "crypto";
import { get } from "@vercel/blob";
import prisma from "@/lib/prisma";
import { extractCv, UnsupportedCvError } from "@/lib/recruitment/extractCv";
import { activeDimensions, rubricFor, screeningSettings, type Dimension } from "./rubric";
import type { ScreeningApplication } from "@/app/generated/prisma/client";

const MODEL = "claude-opus-5";
/** Applications drafted in parallel per invocation. */
const PER_RUN = 3;
const MAX_ATTEMPTS = 3;
/** Longer than an invocation can live, so a slow worker is never raced. */
const LEASE_MS = 6 * 60 * 1000;
const DOC_CHARS = 24_000;

export type Doc = { kind: string; name: string; url: string };
export type Answer = { key: string; label: string; text: string };
export type AiDraft = {
  scores: Record<string, { score: number; evidence: string }>;
  summary: string;
  concerns: string[];
  safeguarding: boolean;
};

// ── Reading documents ────────────────────────────────────────────────────────

/** Our own private blob store is read with the SDK; anything else must be https. */
export async function fetchDoc(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (u.hostname.endsWith(".blob.vercel-storage.com")) {
    const got = await get(url, { access: "private" });
    if (!got) throw new Error("Document not found in storage");
    return Buffer.from(await new Response(got.stream).arrayBuffer());
  }
  if (u.protocol !== "https:") throw new Error("Documents must be served over https");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download document (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function readDoc(doc: Doc | undefined): Promise<{ text: string; images: Anthropic.ImageBlockParam[] } | null> {
  if (!doc) return null;
  const buf = await fetchDoc(doc.url);
  try {
    const got = await extractCv(buf, { maxChars: DOC_CHARS });
    return {
      text: got.text,
      images: got.images.map((im) => ({
        type: "image" as const,
        source: { type: "base64" as const, media_type: im.mediaType, data: im.buffer.toString("base64") },
      })),
    };
  } catch (e) {
    if (e instanceof UnsupportedCvError) return { text: `(${doc.name}: file format could not be read)`, images: [] };
    throw e;
  }
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function systemPrompt(dims: Dimension[], guidance: string, geoLabel: string): string {
  const rubric = dims
    .map(
      (d) =>
        `- key "${d.key}" — ${d.label}\n  ${d.description}\n  1 = ${d.anchors["1"]}\n  3 = ${d.anchors["3"]}\n  5 = ${d.anchors["5"]}`,
    )
    .join("\n");
  return `You are the first reader of applications to The Social Startup Programme, run by the Azim Premji Foundation. It supports development professionals to found and run their own organisations. Selected applicants receive an 8-month fellowship with a monthly stipend; an assessment at the end of the 8 months decides a 2-year seed grant.

You are reading applications for ${geoLabel}. A screener will read your draft next and make every decision. Your scores are a starting point for that person, so be accurate rather than generous, and make each score traceable to the application.

${guidance.trim() ? `About this geography:\n${guidance.trim()}\n\n` : ""}Score each dimension from 1 to 5 (2 and 4 fall between the anchors):
${rubric}

Rules:
- Score only on what the application contains. Do not reward length, polish or English fluency; answers may be in any language, and short answers are not penalised.
- Evidence: one or two sentences per dimension naming what in the application supports the score, quoting it briefly where useful. If the application says nothing relevant, say so and score 1.
- Do not score or comment on gender, religion, caste, age, disability or any other personal characteristic.
- summary: three sentences at most, plain and factual.
- concerns: specific inconsistencies or gaps a screener should check (dates that don't add up, a CV that contradicts the form). Empty if none.
- safeguarding: true only if something in the application suggests a risk to children or vulnerable people.

Write in plain, direct English with no metaphors.`;
}

function outputSchema(dims: Dimension[]) {
  const props: Record<string, unknown> = {};
  for (const d of dims) {
    props[d.key] = {
      type: "object",
      properties: {
        score: { type: "integer", enum: [1, 2, 3, 4, 5] },
        evidence: { type: "string" },
      },
      required: ["score", "evidence"],
      additionalProperties: false,
    };
  }
  return {
    type: "object",
    properties: {
      scores: { type: "object", properties: props, required: dims.map((d) => d.key), additionalProperties: false },
      summary: { type: "string" },
      concerns: { type: "array", items: { type: "string" } },
      safeguarding: { type: "boolean" },
    },
    required: ["scores", "summary", "concerns", "safeguarding"],
    additionalProperties: false,
  };
}

/** The application as the reader sees it. Also used for the reviewer's plain-text view. */
export function applicationText(app: ScreeningApplication, geoLabel: string): string {
  const profile = (app.profile ?? {}) as Record<string, unknown>;
  const answers = (app.answers ?? []) as Answer[];
  const members = (app.members ?? []) as Record<string, unknown>[];
  const lines = [
    `Applicant: ${app.name}`,
    `Applying as: ${app.isGroup ? `a group of ${members.length + 1}` : "an individual"}`,
    `Geography: ${geoLabel}`,
    app.theme ? `Theme: ${app.theme}` : null,
    [app.district, app.state].filter(Boolean).length ? `Location: ${[app.block, app.district, app.state].filter(Boolean).join(", ")}` : null,
    "",
    "Form answers:",
    ...Object.entries(profile)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`),
  ];
  for (const a of answers) lines.push("", `=== ${a.label} ===`, a.text || "(no answer)");
  if (app.sopText) lines.push("", "=== Statement of purpose ===", app.sopText);
  if (members.length) lines.push("", "Group members:", ...members.map((m, i) => `- Member ${i + 2}: ${JSON.stringify(m)}`));
  return lines.filter((l) => l !== null).join("\n");
}

// ── One application ──────────────────────────────────────────────────────────

async function draftOne(id: string): Promise<void> {
  const app = await prisma.screeningApplication.findUnique({ where: { id }, include: { geo: true } });
  if (!app) return;
  const settings = await screeningSettings();
  if (!settings.aiEnabled) {
    await prisma.screeningApplication.update({ where: { id }, data: { aiStatus: "off", aiLockedAt: null } });
    return;
  }
  const rubric = await rubricFor(app.geo?.key ?? null);
  const dims = activeDimensions(rubric.dimensions, app.isGroup);
  const geoLabel = app.geo?.label ?? "an unspecified geography";

  // Extract once and keep the text: a re-draft, or the reviewer's view, then
  // doesn't need the file again.
  const docs = (app.documents ?? []) as Doc[];
  let cvImages: Anthropic.ImageBlockParam[] = [];
  let { cvText, sopText } = app;
  if (cvText === null) {
    const cv = await readDoc(docs.find((d) => d.kind === "cv"));
    cvText = cv?.text ?? "";
    cvImages = cv?.images ?? [];
  }
  if (sopText === null) {
    const sop = await readDoc(docs.find((d) => d.kind === "sop"));
    sopText = sop?.text ?? "";
  }
  if (cvText !== app.cvText || sopText !== app.sopText) {
    await prisma.screeningApplication.update({ where: { id }, data: { cvText, sopText } });
  }

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: applicationText({ ...app, cvText, sopText }, geoLabel) },
    { type: "text", text: `=== CV ===\n${cvText || (cvImages.length ? "(scanned — see page images)" : "(no CV text)")}` },
    ...cvImages,
  ];

  const client = new Anthropic();
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    system: [
      // Stable per geography and rubric version, so drafts in a batch share the cache.
      { type: "text", text: systemPrompt(dims, rubric.guidance, geoLabel), cache_control: { type: "ephemeral" } },
    ],
    output_config: { format: { type: "json_schema", schema: outputSchema(dims) } },
    messages: [{ role: "user", content }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The model declined to read this application.");
  if (msg.stop_reason === "max_tokens") throw new Error("The draft ran out of room before finishing.");
  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const draft = JSON.parse(raw) as AiDraft;

  const flags = new Set(app.flags);
  if (draft.safeguarding) flags.add("safeguarding");
  await prisma.screeningApplication.update({
    where: { id },
    data: {
      aiDraft: draft as unknown as never,
      aiRubricVersion: rubric.version,
      aiStatus: "done",
      aiError: null,
      aiLockedAt: null,
      flags: [...flags],
    },
  });
  if (draft.safeguarding && !app.flags.includes("safeguarding")) {
    await prisma.screeningEvent.create({
      data: { applicationId: id, type: "flag_added", detail: { flag: "safeguarding", by: "ai_draft" } },
    });
  }
}

// ── Queue ────────────────────────────────────────────────────────────────────

function drainable() {
  const stale = new Date(Date.now() - LEASE_MS);
  return {
    aiAttempts: { lt: MAX_ATTEMPTS },
    OR: [
      { aiStatus: "pending", aiLockedAt: null },
      // A worker that died, or a draft that failed: both wait out the lease
      // before another try, so a passing fault (an overloaded API, a storage
      // hiccup) isn't retried three times in as many seconds.
      { aiStatus: { in: ["running", "failed"] }, OR: [{ aiLockedAt: null }, { aiLockedAt: { lt: stale } }] },
    ],
  };
}

/** Claim up to PER_RUN applications. Each claim is a conditional update, so two workers never share one. */
async function claim(): Promise<string[]> {
  const candidates = await prisma.screeningApplication.findMany({
    where: drainable(),
    orderBy: { createdAt: "asc" },
    take: PER_RUN * 3,
    select: { id: true },
  });
  const got: string[] = [];
  for (const c of candidates) {
    if (got.length >= PER_RUN) break;
    const n = await prisma.screeningApplication.updateMany({
      where: { id: c.id, ...drainable() },
      // Counted on claim: a worker killed mid-draft reports nothing, and this
      // is what stops that application being retried forever.
      data: { aiStatus: "running", aiLockedAt: new Date(), aiAttempts: { increment: 1 } },
    });
    if (n.count) got.push(c.id);
  }
  return got;
}

/** Draft one batch. Returns whether more are waiting. */
export async function drainDrafts(): Promise<boolean> {
  const ids = await claim();
  await Promise.all(
    ids.map(async (id) => {
      try {
        await draftOne(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[screening-draft] ${id}:`, msg);
        await prisma.screeningApplication.update({
          where: { id },
          data: { aiStatus: "failed", aiError: msg.slice(0, 500), aiLockedAt: new Date() },
        });
      }
    }),
  );
  return (await prisma.screeningApplication.count({ where: drainable() })) > 0;
}

export async function draftsInFlight(): Promise<number> {
  return prisma.screeningApplication.count({
    where: { aiStatus: "running", aiLockedAt: { gte: new Date(Date.now() - LEASE_MS) } },
  });
}

// ── Kicking the worker ───────────────────────────────────────────────────────

export function drainToken(): string {
  return createHmac("sha256", process.env.NEXTAUTH_SECRET || "dev").update("screening-drafts").digest("hex");
}

export function drainTokenValid(given: string | null): boolean {
  if (!given) return false;
  const want = Buffer.from(drainToken());
  const got = Buffer.from(given);
  return want.length === got.length && timingSafeEqual(want, got);
}

export async function kickDrafts(origin: string): Promise<void> {
  try {
    await fetch(`${origin}/api/cron/screening-drafts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${drainToken()}` },
    });
  } catch (e) {
    // The cron sweep restarts the chain; a failed kick only delays it.
    console.error("[screening-draft] kick failed:", e instanceof Error ? e.message : e);
  }
}
