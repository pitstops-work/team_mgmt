/**
 * The public application form's own rules.
 *
 * This is the first endpoint in the app that writes a row with no session
 * behind it, and that changes what the code has to assume. Everywhere else, a
 * server action can trust that *someone* is on the other end and that the
 * audit log can name them. Here it cannot, so three things that are usually
 * someone else's problem become this file's:
 *
 *   Validation is the only validation. The browser form is a convenience; a
 *   POST can carry anything. Every answer is checked against the question it
 *   claims to answer, and a key the call does not ask about is DROPPED rather
 *   than stored — otherwise `answers` is a public JSON bucket.
 *
 *   Size is a security property. A text column with no cap on an open endpoint
 *   is free storage for whoever finds it.
 *
 *   Throttling has to exist at all. There is no rate limiting anywhere in this
 *   codebase, so there is nothing to inherit. What is here is a floor, not a
 *   solution: it counts rows per salted IP hash, which stops the accidental
 *   double-submit and the crude flood, and will not stop anyone who rotates
 *   addresses. A real answer is a bot check at the edge, and this should be
 *   read as a note saying so.
 */

import prisma from "@/lib/prisma";
import { createHash } from "node:crypto";
import { createPublicProposal } from "./proposals";
import type { WindowQuestion } from "./proposalVocabulary";
import { parseQuestions } from "./fundingWindows";
import { moneyToString } from "./money";
import { INTAKE_LIMITS } from "./intakeLimits";

/**
 * The caps live in `intakeLimits.ts` — prisma-free, so the client form can
 * import the same numbers the server enforces — and are re-exported here
 * because this is where they are applied.
 */
export { INTAKE_LIMITS } from "./intakeLimits";

/** Hash, not store. See the migration note for why. */
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const salt = process.env.NEXTAUTH_SECRET ?? "";
  // No salt means no usable hash. Returning null disables the throttle rather
  // than writing a bare, reversible hash of someone's address — and the caller
  // treats a null as "cannot throttle", which is at least honest.
  if (!salt.trim()) return null;
  return createHash("sha256").update(`${salt.trim()}:${ip.trim()}`).digest("hex");
}

/**
 * The first address in `x-forwarded-for` is the client as the edge saw it; the
 * rest are proxies. Taking the last one — a common mistake — throttles Vercel.
 */
export function clientIpFrom(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const first = headerValue.split(",")[0]?.trim();
  return first || null;
}

export type WindowRefusal = "not_found" | "not_open" | "closed";

/**
 * The call, as an applicant may see it.
 *
 * Returns a refusal rather than throwing, and the refusal distinguishes "no
 * such call" from "that call is not taking submissions" — the first is a 404,
 * the second is a page that explains itself. A closed call should say so
 * plainly: an applicant who followed a stale link deserves better than a 404
 * that reads as a broken website.
 */
export async function publicWindowBySlug(
  slug: string,
): Promise<
  | { ok: true; window: PublicWindow }
  | { ok: false; reason: WindowRefusal; name?: string; closesOn?: Date | null }
> {
  const w = await prisma.fundingWindow.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      opensOn: true,
      closesOn: true,
      brief: true,
      ceilingAmount: true,
      questions: true,
    },
  });
  if (!w) return { ok: false, reason: "not_found" };
  if (w.status !== "open") {
    return { ok: false, reason: "not_open", name: w.name, closesOn: w.closesOn };
  }
  if (w.closesOn && w.closesOn < new Date()) {
    // `setWindowStatus` refuses to leave a call in this state, but nothing
    // stops a row reaching it by hand, and the one thing that must not happen
    // is accepting a submission after the published deadline.
    return { ok: false, reason: "closed", name: w.name, closesOn: w.closesOn };
  }

  return {
    ok: true,
    window: {
      id: w.id,
      name: w.name,
      slug: w.slug,
      brief: w.brief,
      opensOn: w.opensOn,
      closesOn: w.closesOn,
      ceilingAmount: w.ceilingAmount ? moneyToString(w.ceilingAmount) : null,
      questions: parseQuestions(w.questions),
    },
  };
}

export type PublicWindow = {
  id: string;
  name: string;
  slug: string;
  brief: string | null;
  opensOn: Date | null;
  closesOn: Date | null;
  ceilingAmount: string | null;
  questions: WindowQuestion[];
};

export type FieldError = { field: string; message: string };

function tooLong(field: string, label: string, value: string, cap: number): FieldError | null {
  return value.length > cap ? { field, message: `${label} is longer than ${cap} characters.` } : null;
}

/**
 * Check the answers against the questions.
 *
 * `enforceRequired` is false while saving a draft and true on submit. A form
 * that refuses to save until it is complete is a form people abandon with
 * everything typed and nothing kept — and the whole point of the resume token
 * is that an application gets filled in over several sittings.
 *
 * Unknown keys are dropped, not rejected: a question removed from a draft call
 * leaves answers behind, and refusing the whole submission over one orphan
 * would strand the applicant with no way forward.
 */
export function validateAnswers(
  questions: WindowQuestion[],
  raw: unknown,
  opts: { enforceRequired: boolean },
): { answers: Record<string, unknown>; errors: FieldError[] } {
  const errors: FieldError[] = [];
  const answers: Record<string, unknown> = {};
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};

  for (const q of questions) {
    const v = input[q.key];
    const empty = v === undefined || v === null || v === "";

    if (empty) {
      if (q.required && opts.enforceRequired) {
        errors.push({ field: q.key, message: `${q.label} is needed.` });
      }
      continue;
    }

    switch (q.type) {
      case "text":
      case "textarea": {
        const str = String(v);
        const cap = q.type === "text" ? INTAKE_LIMITS.shortText : INTAKE_LIMITS.longText;
        const err = tooLong(q.key, q.label, str, cap);
        if (err) errors.push(err);
        else answers[q.key] = str;
        break;
      }
      case "number": {
        const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
        if (!Number.isFinite(n)) {
          errors.push({ field: q.key, message: `${q.label} should be a number.` });
        } else if (n < 0) {
          errors.push({ field: q.key, message: `${q.label} cannot be negative.` });
        } else {
          answers[q.key] = n;
        }
        break;
      }
      case "boolean": {
        answers[q.key] = v === true || v === "true" || v === "yes" || v === "on";
        break;
      }
      case "select": {
        const str = String(v);
        // The options are the question. An answer outside them is either a
        // stale form or a hand-made POST, and storing it would put a value in
        // the column that no report knows how to count.
        if (!(q.options ?? []).includes(str)) {
          errors.push({ field: q.key, message: `Choose one of the options for ${q.label}.` });
        } else {
          answers[q.key] = str;
        }
        break;
      }
      case "date": {
        const d = new Date(String(v));
        if (Number.isNaN(d.getTime())) {
          errors.push({ field: q.key, message: `${q.label} is not a date.` });
        } else {
          answers[q.key] = d.toISOString().slice(0, 10);
        }
        break;
      }
    }
  }

  // The whole JSON, after the per-field caps. A call with forty long-text
  // questions is within every individual limit and still a problem.
  const size = JSON.stringify(answers).length;
  if (size > INTAKE_LIMITS.answersBytes) {
    errors.push({
      field: "_answers",
      message: "The answers together are too long. Please shorten them, or send detail as a document later.",
    });
  }

  return { answers, errors };
}

export type ApplicantFields = {
  applicantOrgName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  title?: string;
  summary?: string;
  requestedAmount?: string;
  requestedMonths?: string;
  city?: string;
  domains?: string[];
  answers?: unknown;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The fields every call asks for, whatever its question set.
 *
 * Validated here rather than in `createPublicProposal`, which trims and
 * accepts: the library's three `throw`s are a sanity floor for a trusted
 * caller, and this caller is the open internet.
 */
export function validateApplicantFields(
  input: ApplicantFields,
  opts: { enforceRequired: boolean },
): {
  errors: FieldError[];
  clean: {
    applicantOrgName: string;
    contactName: string;
    contactEmail: string;
    contactPhone: string | undefined;
    title: string;
    summary: string | undefined;
    requestedAmount: number | null;
    requestedMonths: number | null;
    city: string | null;
    domains: string[];
  };
} {
  const errors: FieldError[] = [];
  const str = (v: string | undefined) => (v ?? "").trim();

  const applicantOrgName = str(input.applicantOrgName);
  const contactName = str(input.contactName);
  const contactEmail = str(input.contactEmail).toLowerCase();
  const title = str(input.title);
  const summary = str(input.summary);
  const city = str(input.city);
  const contactPhone = str(input.contactPhone);

  // Needed to create the row at all, draft or not: without a name and an email
  // there is nothing to come back to and nobody to come back to it.
  if (!applicantOrgName) errors.push({ field: "applicantOrgName", message: "Tell us the organisation's name." });
  if (!contactEmail) errors.push({ field: "contactEmail", message: "We need an email to reply to." });
  else if (!EMAIL_SHAPE.test(contactEmail)) {
    errors.push({ field: "contactEmail", message: "That email address does not look right." });
  }
  if (!title) errors.push({ field: "title", message: "Give the proposal a title." });

  if (opts.enforceRequired) {
    if (!contactName) errors.push({ field: "contactName", message: "Who should we speak to?" });
    if (!summary) errors.push({ field: "summary", message: "A short summary is needed." });
  }

  for (const [field, label, value, cap] of [
    ["applicantOrgName", "The organisation's name", applicantOrgName, INTAKE_LIMITS.shortText],
    ["contactName", "The contact name", contactName, INTAKE_LIMITS.shortText],
    ["contactEmail", "The email address", contactEmail, INTAKE_LIMITS.shortText],
    ["contactPhone", "The phone number", contactPhone, 40],
    ["title", "The title", title, INTAKE_LIMITS.shortText],
    ["city", "The city", city, INTAKE_LIMITS.shortText],
    ["summary", "The summary", summary, INTAKE_LIMITS.summary],
  ] as const) {
    const err = tooLong(field, label, value, cap);
    if (err) errors.push(err);
  }

  let requestedAmount: number | null = null;
  if (str(input.requestedAmount)) {
    const n = Number(str(input.requestedAmount).replace(/,/g, ""));
    if (!Number.isFinite(n) || n < 0) {
      errors.push({ field: "requestedAmount", message: "The amount should be a number." });
    } else if (n > INTAKE_LIMITS.maxRequestedAmount) {
      // Not a policy ceiling — the call's own ceiling is indicative and this is
      // not it. This refuses a figure that is certainly a typo, because an
      // amount two orders of magnitude out skews every pipeline total it lands in.
      errors.push({ field: "requestedAmount", message: "That amount looks like a typing error." });
    } else {
      requestedAmount = n;
    }
  }

  let requestedMonths: number | null = null;
  if (str(input.requestedMonths)) {
    const n = Number(str(input.requestedMonths));
    if (!Number.isInteger(n) || n <= 0 || n > INTAKE_LIMITS.maxMonths) {
      errors.push({
        field: "requestedMonths",
        message: `A duration should be a whole number of months, up to ${INTAKE_LIMITS.maxMonths}.`,
      });
    } else {
      requestedMonths = n;
    }
  }

  const domains = (input.domains ?? [])
    .map((d) => String(d).trim())
    .filter(Boolean)
    .slice(0, INTAKE_LIMITS.domains);

  return {
    errors,
    clean: {
      applicantOrgName,
      contactName,
      contactEmail,
      contactPhone: contactPhone || undefined,
      title,
      summary: summary || undefined,
      requestedAmount,
      requestedMonths,
      city: city || null,
      domains,
    },
  };
}

/**
 * The floor, not a solution.
 *
 * Counts rows already created from the same salted IP hash. It stops a
 * double-click and a crude flood; it will not stop anyone who rotates
 * addresses, and it cannot see an attempt that was refused before a row
 * existed. Only `start` is throttled: continuing an application needs a
 * 24-byte token, so the guessing surface is the token, not the endpoint.
 */
export async function throttleStart(
  ipHash: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // No hash means no salt configured, or no address from the edge. Refusing
  // every applicant because of our own missing configuration is worse than
  // accepting them, so this fails OPEN — deliberately, and said out loud here
  // rather than discovered later.
  if (!ipHash) return { ok: true };

  const now = Date.now();
  const [hour, day] = await Promise.all([
    prisma.proposal.count({
      where: { createdIpHash: ipHash, createdAt: { gte: new Date(now - 3_600_000) } },
    }),
    prisma.proposal.count({
      where: { createdIpHash: ipHash, createdAt: { gte: new Date(now - 86_400_000) } },
    }),
  ]);

  if (hour >= INTAKE_LIMITS.startsPerHour || day >= INTAKE_LIMITS.startsPerDay) {
    return {
      ok: false,
      message:
        "Several applications have already been started from this connection. If you are continuing an existing one, use the link you saved; otherwise write to us.",
    };
  }
  return { ok: true };
}

/**
 * Start a new application, or continue a saved one.
 *
 * `createPublicProposal` does the writing and owns the token rules — including
 * the one that matters most, that continuing an application requires the resume
 * token and an unsubmitted, unworked proposal. This wraps it with the checks a
 * public caller needs and nothing else, so there is exactly one writer.
 */
export async function saveApplication(input: {
  slug: string;
  publicRef?: string;
  resumeToken?: string;
  submit: boolean;
  ipHash: string | null;
  fields: ApplicantFields;
}): Promise<
  | { ok: true; publicRef: string; resumeToken?: string; submitted: boolean }
  | { ok: false; errors: FieldError[] }
> {
  const found = await publicWindowBySlug(input.slug);
  if (!found.ok) {
    return {
      ok: false,
      errors: [
        {
          field: "_form",
          message:
            found.reason === "not_found"
              ? "That call for proposals does not exist."
              : `${found.name ?? "This call"} is not taking submissions.`,
        },
      ],
    };
  }

  const fields = validateApplicantFields(input.fields, { enforceRequired: input.submit });
  const { answers, errors: answerErrors } = validateAnswers(
    found.window.questions,
    input.fields.answers,
    { enforceRequired: input.submit },
  );
  const errors = [...fields.errors, ...answerErrors];
  if (errors.length) return { ok: false, errors };

  if (!input.publicRef) {
    const throttle = await throttleStart(input.ipHash);
    if (!throttle.ok) return { ok: false, errors: [{ field: "_form", message: throttle.message }] };
  }

  try {
    const result = await createPublicProposal({
      windowId: found.window.id,
      publicRef: input.publicRef,
      resumeToken: input.resumeToken,
      createdIpHash: input.ipHash ?? undefined,
      submit: input.submit,
      answers,
      ...fields.clean,
    });
    return {
      ok: true,
      publicRef: result.publicRef,
      resumeToken: result.resumeToken,
      submitted: input.submit,
    };
  } catch (err) {
    // The library's refusals are written for an applicant to read — "open your
    // application from the link we emailed you", "already submitted" — so they
    // are surfaced rather than swallowed into a generic failure.
    return {
      ok: false,
      errors: [{ field: "_form", message: err instanceof Error ? err.message : "Something went wrong." }],
    };
  }
}

/**
 * A saved draft, for the form to reopen.
 *
 * Deliberately NOT `resumeProposal` from the library: that returns the row
 * including its token hash, which must never reach a browser. This names the
 * fields the form needs and nothing else.
 */
export async function draftForForm(publicRef: string, token: string) {
  const row = await prisma.proposal.findUnique({
    where: { publicRef },
    select: {
      publicRef: true,
      resumeTokenHash: true,
      resumeExpiresAt: true,
      submittedAt: true,
      stage: true,
      applicantOrgName: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      title: true,
      summary: true,
      requestedAmount: true,
      requestedMonths: true,
      city: true,
      domains: true,
      answers: true,
      window: { select: { slug: true } },
    },
  });
  if (!row?.resumeTokenHash) return null;
  // Same hash the library writes: sha256 of the raw token, compared rather
  // than looked up, so a wrong token is indistinguishable from a wrong ref.
  if (row.resumeTokenHash !== createHash("sha256").update(token).digest("hex")) return null;
  if (row.resumeExpiresAt && row.resumeExpiresAt < new Date()) return null;

  return {
    publicRef: row.publicRef,
    editable: !row.submittedAt && row.stage === "received",
    submittedAt: row.submittedAt,
    windowSlug: row.window?.slug ?? null,
    fields: {
      applicantOrgName: row.applicantOrgName,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone ?? "",
      title: row.title,
      summary: row.summary ?? "",
      requestedAmount: row.requestedAmount ? moneyToString(row.requestedAmount) : "",
      requestedMonths: row.requestedMonths ? String(row.requestedMonths) : "",
      city: row.city ?? "",
      domains: row.domains,
      answers: (row.answers ?? {}) as Record<string, unknown>,
    },
  };
}
