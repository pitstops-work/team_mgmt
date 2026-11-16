/**
 * The RAG scale, and the one piece of arithmetic anyone does with it.
 *
 * Prisma-free — a type-only import of the enum — because the assessment screen
 * is a client component and needs the same ordering the server sorts by. A
 * module that reaches prisma typechecks clean and then fails the build with
 * "Can't resolve 'dns'"; `tsc` cannot see the client/server bundler boundary,
 * so keeping shared constants here is the only defence. This work has paid for
 * that lesson twice.
 */

import type { Rag } from "@/app/generated/prisma/client";

/** Worst first, so a sort on this gives the attention order. */
export const RAG_ORDER: Record<Rag, number> = { red: 0, amber: 1, green: 2 };

export const RAGS: Rag[] = ["red", "amber", "green"];

export const RAG_LABELS: Record<Rag, string> = {
  red: "Red",
  amber: "Amber",
  green: "Green",
};

/**
 * What each colour is actually claiming.
 *
 * Written out because a RAG scale with no definitions is three people using
 * three scales. These are deliberately about ACTION rather than about feeling:
 * "amber" that means "I am a bit worried" cannot be audited, and "amber" that
 * means "this needs a conversation before the next release" can.
 */
export const RAG_MEANINGS: Record<Rag, string> = {
  red: "Something has to change before the next release. Escalate now.",
  amber: "Off track in a way that needs a conversation, not yet a decision.",
  green: "On track. Nothing here needs anyone's attention.",
};

export const RAG_CLASSES: Record<Rag, string> = {
  red: "bg-red-100 text-red-800 border-red-300",
  amber: "bg-amber-100 text-amber-800 border-amber-300",
  green: "bg-green-100 text-green-800 border-green-300",
};

export function isRag(v: string): v is Rag {
  return (RAGS as string[]).includes(v);
}

/**
 * The worse of two ratings.
 *
 * Used to decide whether an overall rating is an OVERRIDE of the two axes and
 * therefore needs its reason written down. Not used to derive the overall
 * rating: that is a reviewer's judgement, and taking it away would remove the
 * only thing this table records that a report cannot.
 */
export function worstRag(a: Rag, b: Rag): Rag {
  return RAG_ORDER[a] <= RAG_ORDER[b] ? a : b;
}

/** True when the overall rating is kinder than the worse of the two axes. */
export function isOptimisticOverride(programme: Rag, finance: Rag, overall: Rag): boolean {
  return RAG_ORDER[overall] > RAG_ORDER[worstRag(programme, finance)];
}

/**
 * How long a rating stays useful.
 *
 * Not a policy anyone has written down, which is why it is one number in one
 * place rather than a literal in three screens. A judgement about a grant's
 * health that is six months old is a judgement about a different grant.
 */
export const ASSESSMENT_STALE_DAYS = 120;
export const ASSESSMENT_WARN_DAYS = 90;
