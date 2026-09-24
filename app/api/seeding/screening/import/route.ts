/**
 * POST /api/seeding/screening/import — multipart: `sheet` (CSV/XLSX), `files`
 * (JSON [{ name, url }] of documents already uploaded), `dryRun` ("1" to only
 * report what would happen).
 */

import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { getSeedingAccess } from "@/lib/seeding/access";
import { getScreeningAccess } from "@/lib/seeding/screening/access";
import { parseSheet } from "@/lib/seeding/screening/importSheet";
import { upsertApplication, validateInput, resolveGeo } from "@/lib/seeding/screening/intake";
import { kickDrafts } from "@/lib/seeding/screening/draft";
import { selfOrigin } from "@/lib/recruitment/batchRunner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await auth();
  const s = session ? await getScreeningAccess(await getSeedingAccess(session)) : null;
  if (!s || !(s.all || s.canConfigure)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const form = await req.formData();
  const sheet = form.get("sheet");
  if (!(sheet instanceof File)) return NextResponse.json({ error: "Attach the spreadsheet" }, { status: 400 });
  let files: { name: string; url: string }[] = [];
  try {
    files = JSON.parse(String(form.get("files") || "[]"));
  } catch {
    return NextResponse.json({ error: "Bad file list" }, { status: 400 });
  }
  const dryRun = form.get("dryRun") === "1";

  const parsed = parseSheet(Buffer.from(await sheet.arrayBuffer()), files);
  const problems = [...parsed.errors];
  let created = 0;
  let updated = 0;
  let noGeo = 0;
  for (const input of parsed.inputs) {
    const bad = validateInput(input);
    if (bad) {
      problems.push(bad);
      continue;
    }
    if (!(await resolveGeo(input.geography))) noGeo++;
    if (dryRun) continue;
    try {
      const r = await upsertApplication(input, "import", s.userId);
      if (r.created) created++;
      else updated++;
    } catch (e) {
      problems.push(e instanceof Error ? e.message : `${input.ref}: could not be saved`);
    }
  }
  if (!dryRun && created + updated > 0) {
    const origin = selfOrigin(req.url);
    after(() => kickDrafts(origin));
  }
  return NextResponse.json({
    rows: parsed.inputs.length,
    created,
    updated,
    noGeography: noGeo,
    mapping: parsed.mapping,
    unmatchedFiles: parsed.unmatchedFiles,
    problems: problems.slice(0, 50),
    dryRun,
  });
}
