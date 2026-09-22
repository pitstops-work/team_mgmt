import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import type { ScoutDocData } from "@/lib/recruitment/renderDoc";

export const runtime = "nodejs";

// GET /api/recruitment/[slug]/export → .xlsx of the whole desk
//
// Everything the desk holds about each candidate, flattened for people who
// want to sort, filter and share outside the doc: the scouting read, the
// team's live scores and notes, the interview-transcript summary, and the
// per-candidate interview questions with what was actually asked.
//
// Gated on `recruitment.read` — the same grant that opens the desk. This is a
// download of candidate PII, so it is deliberately not wider than that.
//
// `cvText` is NOT exported. It is the raw CV the scouting was derived from,
// runs to tens of thousands of characters, and would hit Excel's 32,767-char
// cell limit while making every row unreadable. The scouting read, flags and
// questions are the assessment; the CV is its input.

type CandidateState = {
  score?: number | null;
  verdict?: string | null;
  notes?: string;
  city?: string | null;
  asked?: Record<string, boolean>;
  transcript?: {
    name?: string;
    words?: number;
    truncated?: boolean;
    summary?: { strengths?: string[]; concerns?: string[]; followUps?: string[]; verdictCue?: string };
  } | null;
};

const bullets = (xs?: string[]) => (xs && xs.length ? xs.map((s) => `• ${s}`).join("\n") : "");

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { req });
  if (!(await can(ctx, "recruitment", "read"))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [day, stateRow] = await Promise.all([
    prisma.recruitmentScoutingDay.findUnique({
      where: { slug },
      include: { location: { select: { city: true } }, job: { select: { title: true, locations: { select: { id: true, city: true } } } } },
    }),
    prisma.recruitmentScoutState.findUnique({ where: { slug } }),
  ]);
  if (!day?.snapshotJson) {
    return NextResponse.json({ error: "This desk has no saved data to export." }, { status: 404 });
  }

  const data = day.snapshotJson as unknown as ScoutDocData;
  const state = (stateRow?.stateJson ?? {}) as Record<string, CandidateState>;
  const cityById = new Map((day.job?.locations ?? []).map((l) => [l.id, l.city]));
  const axes = (data.axes || []).slice(0, 6);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pitstops Recruitment";
  wb.created = new Date();

  // ── Sheet 1: candidates, one row each ──────────────────────────────────────
  const cs = wb.addWorksheet("Candidates", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  cs.columns = [
    { header: "Code", key: "code", width: 8 },
    { header: "Name", key: "name", width: 26 },
    { header: "Score", key: "score", width: 7 },
    { header: "Verdict", key: "verdict", width: 9 },
    { header: "City", key: "city", width: 18 },
    { header: "Position", key: "pos", width: 24 },
    { header: "Profile", key: "meta", width: 34 },
    ...axes.map((a, i) => ({ header: a, key: `ax${i}`, width: 9 })),
    { header: "Red flags", key: "red", width: 40 },
    { header: "Yellow flags", key: "yellow", width: 40 },
    { header: "Scout report", key: "scout", width: 70 },
    { header: "Interview notes", key: "notes", width: 50 },
    { header: "Questions asked", key: "asked", width: 15 },
    { header: "Transcript", key: "tname", width: 22 },
    { header: "Transcript words", key: "twords", width: 16 },
    { header: "What they showed", key: "tstr", width: 50 },
    { header: "Concerns", key: "tcon", width: 50 },
    { header: "Probe next", key: "tfol", width: 50 },
    { header: "Read", key: "tcue", width: 50 },
  ];

  // Ranked the way the desk ranks them: scored candidates first, best down.
  // Unscored keep their scouting order underneath, so an unworked desk still
  // exports in a sensible sequence rather than alphabetically.
  const ranked = data.candidates
    .map((c, i) => ({ c, i, st: state[c.id] ?? {} }))
    .sort((a, b) => {
      const as = typeof a.st.score === "number" ? a.st.score : null;
      const bs = typeof b.st.score === "number" ? b.st.score : null;
      if (as != null && bs != null && as !== bs) return bs - as;
      if (as != null && bs == null) return -1;
      if (as == null && bs != null) return 1;
      return a.i - b.i;
    });

  for (const { c, st } of ranked) {
    const flags = c.flags || [];
    const sum = st.transcript?.summary;
    const askedN = Object.values(st.asked ?? {}).filter(Boolean).length;
    const row: Record<string, unknown> = {
      code: c.code,
      name: c.name,
      score: typeof st.score === "number" ? st.score : "",
      verdict: st.verdict ?? "",
      city: st.city ? cityById.get(st.city) ?? "" : day.location?.city ?? "",
      pos: c.pos,
      meta: c.meta,
      red: flags.filter(([s]) => s === "r").map(([, t]) => `• ${t}`).join("\n"),
      yellow: flags.filter(([s]) => s !== "r").map(([, t]) => `• ${t}`).join("\n"),
      scout: c.scout,
      notes: st.notes ?? "",
      asked: `${askedN}/${(c.qs || []).length}`,
      tname: st.transcript?.name ?? "",
      twords: st.transcript?.words ?? "",
      tstr: bullets(sum?.strengths),
      tcon: bullets(sum?.concerns),
      tfol: bullets(sum?.followUps),
      tcue: sum?.verdictCue ?? "",
    };
    axes.forEach((_, i) => { row[`ax${i}`] = c.attrs?.[i] ?? ""; });
    const r = cs.addRow(row);
    // Wrap the prose columns so a report is readable without widening columns.
    ["red", "yellow", "scout", "notes", "tstr", "tcon", "tfol", "tcue"].forEach((k) => {
      r.getCell(k).alignment = { wrapText: true, vertical: "top" };
    });
    r.getCell("score").numFmt = "0.0";
  }
  cs.getRow(1).font = { bold: true };
  cs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cs.columnCount } };

  // ── Sheet 2: interview questions, one row per question ─────────────────────
  // Separate sheet because questions are 1-to-many per candidate; flattening
  // them into the row above would either truncate them or make it unreadable.
  const qs = wb.addWorksheet("Interview questions", { views: [{ state: "frozen", ySplit: 1 }] });
  qs.columns = [
    { header: "Candidate", key: "name", width: 26 },
    { header: "Code", key: "code", width: 8 },
    { header: "#", key: "n", width: 5 },
    { header: "Question", key: "q", width: 100 },
    { header: "Asked", key: "asked", width: 8 },
  ];
  for (const { c, st } of ranked) {
    (c.qs || []).forEach((q, i) => {
      const r = qs.addRow({ name: c.name, code: c.code, n: i + 1, q, asked: st.asked?.[String(i)] ? "yes" : "" });
      r.getCell("q").alignment = { wrapText: true, vertical: "top" };
    });
  }
  qs.getRow(1).font = { bold: true };
  qs.autoFilter = { from: "A1", to: "E1" };

  // ── Sheet 3: the desk itself ───────────────────────────────────────────────
  const info = wb.addWorksheet("Desk");
  info.columns = [
    { header: "Field", key: "k", width: 22 },
    { header: "Value", key: "v", width: 110 },
  ];
  const scored = ranked.filter((r) => typeof r.st.score === "number").length;
  const withTranscript = ranked.filter((r) => r.st.transcript?.summary).length;
  for (const [k, v] of [
    ["Desk", day.title],
    ["Job description", day.job?.title ?? "—"],
    ["City", day.location?.city ?? "Unplaced — no city assigned"],
    ["Interview date", day.matchday ? day.matchday.toISOString().slice(0, 10) : "—"],
    ["Candidates", String(data.candidates.length)],
    ["Scored so far", `${scored} of ${data.candidates.length}`],
    ["Transcripts summarised", `${withTranscript} of ${data.candidates.length}`],
    ["Radar axes", axes.join(", ")],
    ["Headlines", (data.headlines || []).join("\n")],
    ["Ask every candidate", (data.everyone || []).map((p) => p.replace(/<\/?b>/g, "")).join("\n\n")],
    ["Desk link", `/recruitment/${slug}`],
    ["Exported", new Date().toISOString().slice(0, 16).replace("T", " ")],
  ] as [string, string][]) {
    const r = info.addRow({ k, v });
    r.getCell("v").alignment = { wrapText: true, vertical: "top" };
  }
  info.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const safe = (day.title || slug).replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safe || slug}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
