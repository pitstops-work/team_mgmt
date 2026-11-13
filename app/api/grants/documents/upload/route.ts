import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isSuperAdmin, isBudgetAdmin } from "@/lib/roleGuard";
import { documentViewer } from "@/lib/budget/documentViewer";
import { attachDocument, documentPathname } from "@/lib/budget/documents";
import {
  ACCEPTED_MIME,
  DOCUMENT_KINDS,
  MAX_DOCUMENT_BYTES,
  documentLabel,
  granteeMayUpload,
} from "@/lib/budget/documentKinds";
import type { GrantDocumentKind } from "@/app/generated/prisma/client";

export const runtime = "nodejs";

/**
 * Attach a document to a grant, stored privately.
 *
 * `access: 'private'`, unlike `/api/budget/blob-upload`, which writes public
 * blobs. A public blob URL is unauthenticated for ever: fine-ish for a throwaway
 * scan, wrong for audited accounts and a signed contract. These bytes are only
 * reachable through `/api/grants/documents/[id]/file`, which re-checks the
 * viewer against the grant and the kind.
 *
 * Authorisation is roleGuard + grantee attachment rather than RBAC scopes on
 * purpose: this is reached from a form and an `<a href>`, neither of which can
 * send the `X-Surface` header `fetchJson` adds, and a route gated on an RBAC
 * surface would 403 every grantee while admins sailed through.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const viewer = await documentViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const kindRaw = String(form.get("kind") ?? "");
  const budgetId = String(form.get("budgetId") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const supersedesId = String(form.get("supersedesId") ?? "") || undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  if (!(kindRaw in DOCUMENT_KINDS)) {
    return NextResponse.json({ error: "Unknown document kind." }, { status: 400 });
  }
  const kind = kindRaw as GrantDocumentKind;
  if (!budgetId) {
    return NextResponse.json({ error: "Which grant is this for?" }, { status: 400 });
  }

  // ── Who may attach what ──────────────────────────────────────────────────
  if (viewer.isInternal) {
    const budget = await prisma.budget.findUnique({
      where: { id: budgetId },
      select: { id: true },
    });
    if (!budget) return NextResponse.json({ error: "Grant not found." }, { status: 404 });
    if (!(isSuperAdmin(session) || isBudgetAdmin(session))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    if (!viewer.grantBudgetIds.includes(budgetId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // The kind check is the one that matters here. Without it a grantee could
    // attach an "appraisal note" or "committee minutes" to their own grant —
    // writing into our internal record, in a kind they cannot even read back.
    if (!granteeMayUpload(kind)) {
      return NextResponse.json(
        { error: `${documentLabel(kind)} is not something you can upload.` },
        { status: 403 },
      );
    }
  }

  // ── The file itself ──────────────────────────────────────────────────────
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 25 MB.` },
      { status: 413 },
    );
  }
  const looksAccepted =
    (ACCEPTED_MIME as readonly string[]).includes(file.type) ||
    /\.(pdf|jpe?g|png|xlsx?|docx?)$/i.test(file.name);
  if (!looksAccepted) {
    return NextResponse.json(
      { error: "Attach a PDF, image, spreadsheet or Word document." },
      { status: 415 },
    );
  }

  try {
    const { put } = await import("@vercel/blob");
    const pathname = documentPathname(kind, file.name);
    const blob = await put(pathname, file, {
      access: "private",
      // The pathname already carries a UUID, and a stable one is what the
      // database row points at.
      addRandomSuffix: false,
      contentType: file.type || undefined,
    });

    const result = await attachDocument(session, {
      kind,
      title: title || file.name,
      // The PATHNAME, not a URL: private blobs are fetched through our route.
      fileUrl: blob.pathname,
      mimeType: file.type || null,
      sizeBytes: file.size,
      budgetId,
      supersedesId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The upload failed.";
    // A missing BLOB_READ_WRITE_TOKEN is the likeliest cause locally, and the
    // raw error for it reads as a generic failure.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
