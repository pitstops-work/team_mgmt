"use server";

/**
 * The only unauthenticated server actions in this codebase.
 *
 * Everything in app/(budget) starts with a session and asks what that session
 * may do. These two start with nothing, so they are written against a different
 * question: what can a hostile caller get out of this?
 *
 * The answers, and where each is enforced:
 *
 *   Write someone else's application → no. Continuing one requires the resume
 *   token, checked in `createPublicProposal` against the stored hash, and the
 *   proposal has to still be unsubmitted and unworked.
 *
 *   Read someone else's application → no. Neither action returns proposal data.
 *   `loadDraft` does, and only against a matching token; a wrong token and a
 *   wrong reference both return null, so one cannot be used to prove the other.
 *
 *   Use the table as storage → capped, per field and in total, in
 *   `lib/budget/publicIntake.ts`.
 *
 *   Flood it → throttled per salted IP hash on `start` only. That is a floor
 *   and not a solution; the honest fix is a bot check at the edge.
 *
 *   Learn whether a call exists → yes, and that is fine: a call for proposals
 *   is published.
 */

import { headers } from "next/headers";
import {
  saveApplication,
  draftForForm,
  clientIpFrom,
  hashIp,
  type ApplicantFields,
  type FieldError,
} from "@/lib/budget/publicIntake";

async function ipHash() {
  const h = await headers();
  return hashIp(clientIpFrom(h.get("x-forwarded-for") ?? h.get("x-real-ip")));
}

export type SaveResult =
  | { ok: true; publicRef: string; resumeToken?: string; submitted: boolean }
  | { ok: false; errors: FieldError[] };

/**
 * Save a draft, or submit.
 *
 * One action for both because they are the same write with one flag, and
 * splitting them would mean two places that have to agree about validation.
 * `submit` is what turns required questions into refusals.
 */
export async function saveApplicationDraft(input: {
  slug: string;
  publicRef?: string;
  resumeToken?: string;
  submit: boolean;
  fields: ApplicantFields;
}): Promise<SaveResult> {
  return saveApplication({
    slug: input.slug,
    publicRef: input.publicRef,
    resumeToken: input.resumeToken,
    submit: input.submit,
    ipHash: await ipHash(),
    fields: input.fields,
  });
}

/**
 * Reopen a saved draft.
 *
 * Returns null for a wrong reference, a wrong token, an expired token and a
 * submitted application alike — the caller cannot tell which, which is the
 * point: distinguishing them would turn this into an oracle for which
 * references exist.
 */
export async function loadDraft(publicRef: string, token: string) {
  if (!publicRef?.trim() || !token?.trim()) return null;
  return draftForForm(publicRef.trim(), token.trim());
}
