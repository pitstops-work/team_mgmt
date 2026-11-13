/**
 * The grant document repository.
 *
 * ── Storage, and why it is not the existing pattern ─────────────────────────
 *
 * `/api/budget/blob-upload` writes `access: 'public'`. A public Vercel blob URL
 * is unguessable but unauthenticated: anyone holding the link reads the file,
 * for ever, with no sign-in and no trace. That is already true of the bank
 * statements that route handles, and it is not a precedent worth extending to a
 * repository whose contents are audited accounts, FCRA returns, a signed
 * contract and the committee's own minutes.
 *
 * So grant documents are stored with `access: 'private'` and served through
 * `/api/grants/documents/[id]/file`, which re-checks the viewer against the
 * grant AND the document's kind before streaming a byte, and records the read.
 *
 * `GrantDocument.fileUrl` therefore holds a blob PATHNAME, not a URL. The
 * column was free to redefine because there were zero rows when this was
 * written. A value beginning `http` is still treated as a public or external
 * URL and passed through unchanged, so an external link remains possible
 * without a second column — and so this does not become the kind of migration
 * that has to be finished before anything works.
 *
 * ── "Attached to this grant" is not permission to read ─────────────────────
 *
 * The appraisal note and the board minutes hang off the same budget as the
 * grantee's own utilisation certificate. Access is therefore per DOCUMENT, not
 * per grant: `canReadDocument` asks the grant question and then the kind
 * question, and `lib/budget/documentKinds.ts` holds the second as a Record over
 * the enum so a new kind cannot default to visible.
 */

import prisma from "@/lib/prisma";
import type { GrantDocumentKind, GrantConditionTiming } from "@/app/generated/prisma/client";
import { logGrant } from "./audit";
import { auditLog } from "@/lib/auditLog";
import {
  DOCUMENT_KINDS,
  documentLabel,
  granteeMaySee,
  granteeMayUpload,
} from "./documentKinds";

type SessionLike = { user?: { id?: string | null } | null } | null;

/** Where a document's bytes live. */
export function isExternalUrl(fileUrl: string): boolean {
  return /^https?:\/\//i.test(fileUrl);
}

/** The URL the UI should use to open a document, whatever the storage. */
export function documentHref(doc: { id: string; fileUrl: string }): string {
  return isExternalUrl(doc.fileUrl)
    ? doc.fileUrl
    : `/api/grants/documents/${doc.id}/file`;
}

/**
 * A blob pathname that cannot be guessed from the grant, and cannot collide.
 *
 * The grant id is deliberately NOT in the path. A private blob is only reachable
 * through our own route, but pathnames show up in store listings and logs, and
 * there is no reason for one to announce which grantee's audited accounts it
 * holds.
 */
export function documentPathname(kind: GrantDocumentKind, originalName: string): string {
  const safe =
    originalName
      .slice(-80)
      // Anything outside this set becomes an underscore, so no separator from
      // the original name survives into the pathname.
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      // Then collapse runs of dots. A `..` cannot traverse once the slashes are
      // gone, but leaving one in means the pathname still *reads* like a
      // traversal attempt in a log, and some storage tooling normalises it.
      .replace(/\.{2,}/g, ".")
      // A leading dot or separator makes a hidden or oddly-sorted object.
      .replace(/^[._-]+/, "") || "file";
  const rand = globalThis.crypto.randomUUID();
  return `grant-documents/${kind}/${rand}/${safe}`;
}

// ── Reading ─────────────────────────────────────────────────────────────────

export type DocumentRow = {
  id: string;
  kind: GrantDocumentKind;
  kindLabel: string;
  title: string;
  href: string;
  mimeType: string | null;
  sizeBytes: number | null;
  version: number;
  supersedesId: string | null;
  isSuperseded: boolean;
  uploadedBy: string | null;
  createdAt: Date;
  /** Which thing it hangs off, for a repository view that spans the lifecycle. */
  anchor: "budget" | "agreement" | "condition" | "meeting" | "disbursement" | "closure" | "proposal";
};

function anchorOf(d: {
  agreementId: string | null;
  conditionId: string | null;
  meetingId: string | null;
  disbursementId: string | null;
  closureId: string | null;
  proposalId: string | null;
}): DocumentRow["anchor"] {
  if (d.agreementId) return "agreement";
  if (d.conditionId) return "condition";
  if (d.meetingId) return "meeting";
  if (d.disbursementId) return "disbursement";
  if (d.closureId) return "closure";
  if (d.proposalId) return "proposal";
  return "budget";
}

/**
 * Every document for one grant, filtered for the audience.
 *
 * The filter is applied in the QUERY for a grantee, not after it, so an
 * internal-only document never enters the response the page is built from.
 * Filtering in the component would leave the bytes in the RSC payload.
 */
export async function documentsFor(
  budgetId: string,
  opts: { audience: "internal" | "partner"; includeSuperseded?: boolean },
): Promise<DocumentRow[]> {
  const visibleKinds = (Object.keys(DOCUMENT_KINDS) as GrantDocumentKind[]).filter((k) =>
    opts.audience === "partner" ? granteeMaySee(k) : true,
  );

  const docs = await prisma.grantDocument.findMany({
    where: {
      kind: { in: visibleKinds },
      OR: [
        { budgetId },
        { agreement: { budgetId } },
        { condition: { decision: { budgetId } } },
        { disbursement: { budgetId } },
        { closure: { budgetId } },
        { proposal: { budgetId } },
      ],
      ...(opts.includeSuperseded ? {} : { supersededBy: { is: null } }),
    },
    select: {
      id: true,
      kind: true,
      title: true,
      fileUrl: true,
      mimeType: true,
      sizeBytes: true,
      version: true,
      supersedesId: true,
      createdAt: true,
      agreementId: true,
      conditionId: true,
      meetingId: true,
      disbursementId: true,
      closureId: true,
      proposalId: true,
      supersededBy: { select: { id: true } },
      uploadedBy: { select: { name: true } },
    },
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
  });

  return docs.map((d) => ({
    id: d.id,
    kind: d.kind,
    kindLabel: documentLabel(d.kind),
    title: d.title,
    href: documentHref(d),
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    version: d.version,
    supersedesId: d.supersedesId,
    isSuperseded: Boolean(d.supersededBy),
    uploadedBy: d.uploadedBy?.name ?? null,
    createdAt: d.createdAt,
    anchor: anchorOf(d),
  }));
}

export type RequirementRow = {
  kind: GrantDocumentKind;
  kindLabel: string;
  timing: GrantConditionTiming;
  note: string | null;
  /** True when at least one document of this kind is on file. */
  held: boolean;
  /** Whether the grantee is the one who has to provide it. */
  granteeProvides: boolean;
};

/**
 * Required documents and whether they are on file.
 *
 * Reads exactly what `releaseGate()` reads — the same `isActive`, the same
 * granting-unit fallback, the same "any document of that kind counts" — so this
 * screen cannot tell somebody they are clear while the gate still refuses, or
 * the reverse. There is no second interpretation of a requirement.
 *
 * Worth knowing: `releaseGate` applies `pre_disbursement` requirements to the
 * FIRST tranche only, and never reads `pre_tranche`, `during_grant` or
 * `pre_closure` requirements at all. This view shows all four timings, so a
 * `pre_closure` requirement appears here as outstanding while nothing enforces
 * it. That is the honest rendering of the current state rather than a claim
 * that all four gate something.
 */
export async function requirementStatus(budgetId: string): Promise<RequirementRow[]> {
  const budget = await prisma.budget.findUnique({
    where: { id: budgetId },
    select: { grantingUnitId: true },
  });
  if (!budget) throw new Error("Not found");

  const requirements = await prisma.grantDocumentRequirement.findMany({
    where: {
      isActive: true,
      OR: [{ grantingUnitId: null }, { grantingUnitId: budget.grantingUnitId }],
    },
    select: { kind: true, timing: true, note: true },
    orderBy: [{ timing: "asc" }, { kind: "asc" }],
  });
  if (!requirements.length) return [];

  const held = await prisma.grantDocument.findMany({
    where: { budgetId, kind: { in: requirements.map((r) => r.kind) } },
    select: { kind: true },
  });
  const heldKinds = new Set(held.map((d) => d.kind));

  return requirements.map((r) => ({
    kind: r.kind,
    kindLabel: documentLabel(r.kind),
    timing: r.timing,
    note: r.note,
    held: heldKinds.has(r.kind),
    granteeProvides: granteeMayUpload(r.kind),
  }));
}

// ── Authorisation for one document ──────────────────────────────────────────

export type DocumentAccess =
  | { ok: true; budgetId: string; kind: GrantDocumentKind; fileUrl: string; title: string; mimeType: string | null }
  | { ok: false; reason: "not_found" | "forbidden_grant" | "forbidden_kind" };

/**
 * May this viewer read this specific document?
 *
 * Two questions in order, and both have to pass. A grantee who legitimately
 * reaches their own grant still cannot read its appraisal note, and that is the
 * check `canAccessBudget` alone would miss entirely.
 */
export async function canReadDocument(
  documentId: string,
  viewer: { isInternal: boolean; grantBudgetIds: string[] },
): Promise<DocumentAccess> {
  const doc = await prisma.grantDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      kind: true,
      title: true,
      fileUrl: true,
      mimeType: true,
      budgetId: true,
      agreement: { select: { budgetId: true } },
      condition: { select: { decision: { select: { budgetId: true } } } },
      disbursement: { select: { budgetId: true } },
      closure: { select: { budgetId: true } },
      proposal: { select: { budgetId: true } },
    },
  });
  if (!doc) return { ok: false, reason: "not_found" };

  const budgetId =
    doc.budgetId ??
    doc.agreement?.budgetId ??
    doc.condition?.decision?.budgetId ??
    doc.disbursement?.budgetId ??
    doc.closure?.budgetId ??
    doc.proposal?.budgetId ??
    null;

  // A document anchored to something with no grant behind it (a meeting, say)
  // is internal by construction: there is no grantee it could belong to.
  if (!budgetId) {
    return viewer.isInternal
      ? { ok: true, budgetId: "", kind: doc.kind, fileUrl: doc.fileUrl, title: doc.title, mimeType: doc.mimeType }
      : { ok: false, reason: "forbidden_grant" };
  }

  if (!viewer.isInternal && !viewer.grantBudgetIds.includes(budgetId)) {
    return { ok: false, reason: "forbidden_grant" };
  }
  if (!viewer.isInternal && !granteeMaySee(doc.kind)) {
    return { ok: false, reason: "forbidden_kind" };
  }

  return {
    ok: true,
    budgetId,
    kind: doc.kind,
    fileUrl: doc.fileUrl,
    title: doc.title,
    mimeType: doc.mimeType,
  };
}

/**
 * Record that somebody opened a document.
 *
 * Worth the row: these are audited accounts, bank statements and signed
 * contracts, and "who has read this" is the question an incident starts with.
 * Fire-and-forget, like every other audit write — a failed log must not stop a
 * download.
 */
export function logDocumentRead(documentId: string, userId: string, kind: GrantDocumentKind): void {
  auditLog({
    entityType: "GrantDocument",
    entityId: documentId,
    userId,
    action: "read",
    field: kind,
  });
}

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Attach a document, optionally as a new version of an existing one.
 *
 * Versioning is a chain rather than an overwrite, so the superseded file stays
 * readable: a utilisation certificate that was revised is evidence of both what
 * was claimed and what it became.
 */
export async function attachDocument(
  session: SessionLike,
  input: {
    kind: GrantDocumentKind;
    title: string;
    fileUrl: string;
    mimeType?: string | null;
    sizeBytes?: number | null;
    budgetId?: string;
    agreementId?: string;
    conditionId?: string;
    disbursementId?: string;
    closureId?: string;
    proposalId?: string;
    supersedesId?: string;
  },
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (!input.title?.trim()) throw new Error("Give the document a title.");
  if (!input.fileUrl?.trim()) throw new Error("The file did not upload.");

  const anchors = [
    input.budgetId,
    input.agreementId,
    input.conditionId,
    input.disbursementId,
    input.closureId,
    input.proposalId,
  ].filter(Boolean);
  if (anchors.length !== 1) throw new Error("A document hangs off exactly one thing.");

  let version = 1;
  if (input.supersedesId) {
    const prior = await prisma.grantDocument.findUnique({
      where: { id: input.supersedesId },
      select: { version: true, kind: true, supersededBy: { select: { id: true } } },
    });
    if (!prior) throw new Error("The document being replaced no longer exists.");
    if (prior.supersededBy) throw new Error("That version has already been replaced.");
    // A "new version" of a different kind is not a version, it is a new
    // document — and silently allowing it would break the kind-based access
    // rules, since the chain would span a visible and an invisible kind.
    if (prior.kind !== input.kind) {
      throw new Error(
        `A ${documentLabel(input.kind)} cannot be a new version of a ${documentLabel(prior.kind)}.`,
      );
    }
    version = prior.version + 1;
  }

  const doc = await prisma.grantDocument.create({
    data: {
      kind: input.kind,
      title: input.title.trim(),
      fileUrl: input.fileUrl,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes ?? null,
      version,
      supersedesId: input.supersedesId ?? null,
      budgetId: input.budgetId ?? null,
      agreementId: input.agreementId ?? null,
      conditionId: input.conditionId ?? null,
      disbursementId: input.disbursementId ?? null,
      closureId: input.closureId ?? null,
      proposalId: input.proposalId ?? null,
      uploadedById: userId,
    },
    select: { id: true },
  });

  logGrant("GrantDocument", doc.id, userId, input.supersedesId ? "replaced" : "attached", {
    field: `${input.kind} v${version}`,
    to: input.title.trim(),
  });

  return { documentId: doc.id, version };
}

/**
 * Remove a document and its bytes.
 *
 * Deliberately available, and deliberately narrow. The repository is
 * append-and-supersede by design — a revised document should leave both
 * versions readable — but the one case supersession cannot answer is a file
 * uploaded in error, which for this repository means somebody else's audited
 * accounts sitting on the wrong grant. That is a privacy incident, and the
 * remedy for it is deletion, not a version chain pointing at it.
 *
 * Internal only, audited before the delete so the row survives it, and refused
 * once the document is part of a version chain — unpicking a chain is how you
 * end up with a superseded document whose replacement no longer exists.
 */
export async function deleteDocument(
  session: SessionLike,
  documentId: string,
  reason: string,
) {
  const userId = session?.user?.id;
  if (!userId) throw new Error("Not authenticated");
  if (!reason?.trim()) throw new Error("Say why it is being removed — the row outlives the file.");

  const doc = await prisma.grantDocument.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      kind: true,
      title: true,
      fileUrl: true,
      version: true,
      supersedesId: true,
      supersededBy: { select: { id: true } },
    },
  });
  if (!doc) throw new Error("Not found");
  if (doc.supersededBy || doc.supersedesId) {
    throw new Error(
      "This document is part of a version chain. Remove the chain's latest version first, or leave it in place.",
    );
  }

  // Logged BEFORE the delete: afterwards there is nothing left to describe.
  logGrant("GrantDocument", doc.id, userId, "deleted", {
    field: `${doc.kind} v${doc.version}`,
    from: doc.title,
    to: reason.trim(),
  });

  if (!isExternalUrl(doc.fileUrl)) {
    try {
      const { del } = await import("@vercel/blob");
      await del(doc.fileUrl);
    } catch {
      // The database row is the record of truth about what we hold. If the blob
      // delete fails the row still goes, and an orphaned private blob is a
      // smaller problem than a document that reappears on the screen after
      // somebody was told it was gone.
    }
  }

  await prisma.grantDocument.delete({ where: { id: documentId } });
  return { ok: true as const };
}
