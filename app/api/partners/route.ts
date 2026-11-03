/**
 * GET  /api/partners  — the partner picker, for every portal.
 * POST /api/partners  — mint a partner identity (admins).
 *
 * This is the only list a portal may offer when someone chooses a partner.
 * Due diligence, the grant-note drafter and the budget admin all read it, so a
 * partner selected in one is the same row the others see. Before it existed
 * each portal offered its own free-text field, which is how one grantee came to
 * exist in four places under seven spellings.
 *
 * Read is open to any signed-in user: all three portals need the list, and it
 * carries nothing beyond what a partner's name and grant relationships already
 * say. Writes are admin-only — a new identity is a registry change.
 *
 * Deliberately NOT RBAC-surface gated. A bare `fetch()` from a client
 * component sends no X-Surface header, which would 403 every member while
 * admins sailed through, and three portals' pickers would quietly go empty.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { adminForbidden } from "@/lib/roleGuard";
import { listPartners, createPartner } from "@/lib/partners/registry";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const grantingUnit = searchParams.get("grantingUnit")?.trim() || undefined;
  const withGrantsOnly = searchParams.get("withGrantsOnly") === "1";
  const includeArchived = searchParams.get("includeArchived") === "1";

  const partners = await listPartners({ grantingUnit, withGrantsOnly, includeArchived });
  return NextResponse.json({ partners });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const veto = adminForbidden(session);
  if (veto) return veto;

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  // createPartner is idempotent on the normalised name, so a double submit
  // returns the existing partner instead of a second identity.
  const partner = await createPartner({
    name,
    contactName: body?.contactName ?? null,
    contactEmail: body?.contactEmail ?? null,
    contactPhone: body?.contactPhone ?? null,
    notes: body?.notes ?? null,
  });
  return NextResponse.json({ partner }, { status: 201 });
}
