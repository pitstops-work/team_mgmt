// Translation worker. Runs frequently (every 15 minutes) and processes up to
// a handful of pages per tick. A "stale" page is one whose canonicalContent
// has been edited since its translations were generated, or one that has
// non-empty canonical content but no translations at all.
//
// This stays well under the 300s function timeout: 5 pages × 5 target
// languages × ~10s each ≈ 4 min worst case.

import { NextRequest } from "next/server";
import { findPagesNeedingTranslation, translatePage } from "@/lib/wiki/translate";

export const maxDuration = 300;

const BATCH_SIZE = 5;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ok: false, reason: "ANTHROPIC_API_KEY not set" });
  }

  const pages = await findPagesNeedingTranslation(BATCH_SIZE);
  if (pages.length === 0) return Response.json({ ok: true, processed: 0 });

  const results = [];
  for (const p of pages) {
    const r = await translatePage(p.id);
    results.push({ pageId: p.id, ...r });
  }

  return Response.json({ ok: true, processed: pages.length, results });
}
