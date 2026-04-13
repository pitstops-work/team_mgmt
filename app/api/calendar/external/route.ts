import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import ICAL from "ical.js";

export type ExternalEvent = {
  uid: string;
  title: string;
  start: string; // ISO
  end: string;   // ISO
  location: string | null;
  description: string | null;
  allDay: boolean;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { externalCalendarUrl: true },
  });

  if (!user?.externalCalendarUrl) {
    return Response.json({ events: [] });
  }

  // Normalise webcal:// → https://
  const fetchUrl = user.externalCalendarUrl.replace(/^webcal:\/\//i, "https://");

  let icsText: string;
  try {
    const res = await fetch(fetchUrl, {
      headers: { "User-Agent": "Pitstop/1.0 (calendar sync)" },
      // 10s timeout
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[ext-cal] fetch failed ${res.status} for user=${session.user.id}`);
      return Response.json({ error: "Could not fetch calendar" }, { status: 502 });
    }
    icsText = await res.text();
  } catch (err) {
    console.error(`[ext-cal] fetch error for user=${session.user.id}:`, err);
    return Response.json({ error: "Could not reach calendar URL" }, { status: 502 });
  }

  let events: ExternalEvent[] = [];
  try {
    const jcal = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcal);
    const vevents = comp.getAllSubcomponents("vevent");

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const windowEnd   = new Date(now.getFullYear(), now.getMonth() + 3, 1);

    for (const vevent of vevents) {
      try {
        const event = new ICAL.Event(vevent);
        const start = event.startDate?.toJSDate();
        const end   = event.endDate?.toJSDate() ?? start;

        if (!start || start < windowStart || start > windowEnd) continue;

        events.push({
          uid:         event.uid ?? Math.random().toString(36).slice(2),
          title:       event.summary ?? "(no title)",
          start:       start.toISOString(),
          end:         (end ?? start).toISOString(),
          location:    vevent.getFirstPropertyValue("location") as string | null ?? null,
          description: vevent.getFirstPropertyValue("description") as string | null ?? null,
          allDay:      event.startDate?.isDate ?? false,
        });
      } catch {
        // skip malformed events
      }
    }
  } catch (err) {
    console.error(`[ext-cal] parse error for user=${session.user.id}:`, err);
    return Response.json({ error: "Could not parse calendar" }, { status: 422 });
  }

  console.log(`[ext-cal] user=${session.user.id} fetched ${events.length} events`);
  return Response.json({ events });
}
