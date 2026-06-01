import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { NextRequest } from "next/server";

/**
 * GET /api/wiki/capture/search?q=<query>
 *
 * Autocomplete picker for the unified capture flow. Returns matching WikiPage
 * rows (both manual subtype and free-form principle/playbook/runbook) so the
 * facilitator can pick a destination without seeing taxonomy. The client
 * categorises each match with a soft tag ("care response" for manual,
 * "how we work" for everything else).
 *
 * Title-prefix match for now; cross-language search lives on /api/wiki/pages
 * and can be folded in later if facilitators need it.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  if (!q) {
    return Response.json({ results: [] });
  }

  const results = await prisma.wikiPage.findMany({
    where: {
      archivedAt: null,
      status: { not: "retired" },
      title: { contains: q, mode: "insensitive" },
    },
    orderBy: [
      // Manuals first — care-response context is usually the higher-signal hit
      // for a field-circle capture. Then alphabetical.
      { type: "asc" },
      { title: "asc" },
    ],
    take: 8,
    select: {
      id: true,
      slug: true,
      title: true,
      type: true,
      maturity: true,
      isSensitive: true,
    },
  });

  return Response.json({ results });
}
