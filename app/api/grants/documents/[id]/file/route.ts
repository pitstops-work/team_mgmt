import { NextResponse } from "next/server";
import { documentViewer } from "@/lib/budget/documentViewer";
import { canReadDocument, isExternalUrl, logDocumentRead } from "@/lib/budget/documents";

export const runtime = "nodejs";

/**
 * Serve one grant document.
 *
 * The whole point of storing these privately: the bytes are reachable only
 * here, and only after `canReadDocument` has asked both questions — is this
 * viewer attached to the grant, and may they see this KIND. A grantee who
 * legitimately reaches their own grant still cannot read its appraisal note,
 * which a grant-level check alone would hand over.
 *
 * A 404 rather than a 403 for a kind refusal, deliberately: telling a grantee
 * "you are not allowed to see the appraisal note on your grant" discloses that
 * one exists and what it is called.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await documentViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const access = await canReadDocument(id, viewer);
  if (!access.ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  logDocumentRead(id, viewer.userId, access.kind);

  // An external or legacy public URL is passed through rather than proxied.
  if (isExternalUrl(access.fileUrl)) {
    return NextResponse.redirect(access.fileUrl);
  }

  try {
    const { get } = await import("@vercel/blob");
    const result = await get(access.fileUrl, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ error: "The file is no longer available." }, { status: 404 });
    }

    const filename = access.title.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": access.mimeType || result.blob.contentType || "application/octet-stream",
        // `inline` so a PDF opens in the tab, with a sensible name if saved.
        "Content-Disposition": `inline; filename="${filename}"`,
        // Never cached by a shared cache: the URL is stable but the
        // authorisation behind it is not.
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "The file could not be read." }, { status: 502 });
  }
}
