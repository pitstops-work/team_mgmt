import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyCalendarToken } from "@/lib/calendarToken";

// Format ISO date string → iCal UTC datetime (e.g. "20260415T090000Z")
function fmtDt(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
}

// Escape iCal text field values
function escText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold long iCal lines at 75 octets (RFC 5545 §3.1)
function fold(line: string): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let offset = 0;
  let first = true;
  while (offset < bytes.length) {
    const limit = first ? 75 : 74;
    // Walk back to a valid UTF-8 boundary
    let end = Math.min(offset + limit, bytes.length);
    while (end > offset + 1 && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(new TextDecoder().decode(bytes.slice(offset, end)));
    offset = end;
    first = false;
  }
  return parts.join("\r\n ");
}

function line(key: string, value: string): string {
  return fold(`${key}:${value}`);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return new NextResponse("Missing token", { status: 401 });

  const userId = verifyCalendarToken(token);
  if (!userId) return new NextResponse("Invalid token", { status: 401 });

  // Verify user exists
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!user) return new NextResponse("User not found", { status: 404 });

  // Fetch all non-deleted events
  const events = await prisma.pitstopEvent.findMany({
    where: { deletedAt: null, status: { not: "Cancelled" } },
    include: {
      pitstops: {
        select: { pitstop: { select: { title: true, goal: { select: { title: true } } } } },
      },
      attendees: { select: { user: { select: { name: true } } } },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const now = new Date().toISOString();
  const calName = "Pitstop Activities";
  const host = req.nextUrl.hostname;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${host}//Pitstop Activities//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    line("X-WR-CALNAME", escText(calName)),
    "X-WR-CALDESC:Team activities and field visits",
    "X-WR-TIMEZONE:Asia/Kolkata",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    line("X-PUBLISHED-TTL", "PT1H"),
  ];

  for (const ev of events) {
    const dtStart = fmtDt(ev.scheduledAt);
    const dtEnd = ev.endsAt ? fmtDt(ev.endsAt) : fmtDt(
      new Date(new Date(ev.scheduledAt).getTime() + 60 * 60 * 1000).toISOString()
    );

    // Build description
    const pitstopLines = ev.pitstops.map(
      (p) => `• ${p.pitstop.title} (${p.pitstop.goal.title})`
    );
    const attendeeNames = ev.attendees.map((a) => a.user.name ?? "").filter(Boolean);
    const descParts: string[] = [];
    if (ev.description) descParts.push(ev.description);
    if (pitstopLines.length) descParts.push("Pitstops:\\n" + pitstopLines.join("\\n"));
    if (attendeeNames.length) descParts.push("Attendees: " + attendeeNames.join(", "));
    const description = descParts.join("\\n\\n");

    lines.push("BEGIN:VEVENT");
    lines.push(line("UID", `${ev.id}@${host}`));
    lines.push(line("SUMMARY", escText(`[${ev.type}] ${ev.title}`)));
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`DTSTAMP:${fmtDt(now)}`);
    lines.push(`LAST-MODIFIED:${fmtDt(ev.updatedAt.toISOString())}`);
    if (ev.location) lines.push(line("LOCATION", escText(ev.location)));
    if (description) lines.push(fold(`DESCRIPTION:${description}`));
    lines.push(`STATUS:CONFIRMED`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n") + "\r\n";

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pitstop-activities.ics"',
      "Cache-Control": "no-cache, no-store",
    },
  });
}
