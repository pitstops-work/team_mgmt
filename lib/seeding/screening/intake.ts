/**
 * Getting applications into screening.
 *
 * Two doors, one shape. The application portal posts each submission to the
 * intake API; until it exists, an export is imported from a spreadsheet. Both
 * produce an ApplicationInput, and upsertApplication is idempotent on `ref`,
 * so a re-sent or re-imported application updates rather than duplicates.
 */

import prisma from "@/lib/prisma";
import type { Answer, Doc } from "./draft";

export type ApplicationInput = {
  ref: string;
  email: string;
  name: string;
  phone?: string | null;
  /** Geography key (eastern_up) or label ("Eastern UP"). */
  geography?: string | null;
  state?: string | null;
  district?: string | null;
  block?: string | null;
  theme?: string | null;
  isGroup?: boolean;
  submittedAt?: string | null;
  profile?: Record<string, unknown>;
  answers?: Answer[];
  statementOfPurpose?: string | null;
  members?: Record<string, unknown>[];
  criteriaFlags?: { criterion: string; detail?: string }[];
  documents?: Doc[];
};

export const DOC_KINDS = ["cv", "sop", "photo", "class10", "degree", "experience", "other"] as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

/** "Eastern UP", "eastern_up", "North-East India", "NE" … → the SeedingGeo id. */
export async function resolveGeo(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const geos = await prisma.seedingGeo.findMany({ select: { id: true, key: true, label: true } });
  const v = norm(value);
  const aliases: Record<string, string> = {
    bangalore: "bangalore_urban",
    bengaluru: "bangalore_urban",
    bengaluruurban: "bangalore_urban",
    eup: "eastern_up",
    easternuttarpradesh: "eastern_up",
    northeast: "north_east",
    northeastindia: "north_east",
    ne: "north_east",
    orissa: "odisha",
  };
  const byAlias = aliases[v];
  return (
    geos.find((g) => norm(g.key) === v || norm(g.label) === v || g.key === byAlias)?.id ??
    geos.find((g) => v.includes(norm(g.label)) || norm(g.label).includes(v))?.id ??
    null
  );
}

export function validateInput(x: Partial<ApplicationInput>): string | null {
  if (!x.ref || !String(x.ref).trim()) return "ref is required";
  if (!x.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x.email))) return `${x.ref}: a valid email is required`;
  if (!x.name || !String(x.name).trim()) return `${x.ref}: name is required`;
  for (const d of x.documents ?? []) {
    try {
      const u = new URL(d.url);
      if (u.protocol !== "https:") return `${x.ref}: document URLs must be https`;
    } catch {
      return `${x.ref}: document URL "${d.url}" is not a URL`;
    }
  }
  return null;
}

/**
 * Create or update one application. An application already under review keeps
 * its status and reviews; only its content is refreshed. One that nobody has
 * read yet is re-drafted, since what it says may have changed.
 */
export async function upsertApplication(
  input: ApplicationInput,
  source: "api" | "import",
  actorId: string | null,
): Promise<{ id: string; created: boolean }> {
  const geoId = await resolveGeo(input.geography ?? null);
  const answers: Answer[] = (input.answers ?? []).map((a, i) => ({
    key: String(a.key || `q${i + 1}`),
    label: String(a.label || a.key || `Question ${i + 1}`),
    text: String(a.text ?? ""),
  }));
  const data = {
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    geoId,
    state: input.state?.trim() || null,
    district: input.district?.trim() || null,
    block: input.block?.trim() || null,
    theme: input.theme?.trim() || null,
    isGroup: input.isGroup === true || (input.members?.length ?? 0) > 0,
    profile: (input.profile ?? {}) as never,
    answers: answers as never,
    members: (input.members ?? []) as never,
    criteriaFlags: (input.criteriaFlags ?? []) as never,
    documents: (input.documents ?? []) as never,
    sopText: input.statementOfPurpose?.trim() || null,
    submittedAt: input.submittedAt ? new Date(input.submittedAt) : null,
    source,
  };

  const existing = await prisma.screeningApplication.findUnique({
    where: { ref: input.ref },
    select: { id: true, _count: { select: { reviews: true } } },
  });
  if (existing) {
    const unread = existing._count.reviews === 0;
    await prisma.screeningApplication.update({
      where: { id: existing.id },
      data: {
        ...data,
        // New files mean new text; clear it so the next draft re-reads them.
        cvText: null,
        ...(unread ? { aiStatus: "pending", aiAttempts: 0, aiError: null, aiLockedAt: null } : {}),
      },
    });
    await prisma.screeningEvent.create({
      data: { applicationId: existing.id, actorId, type: "updated", detail: { source } },
    });
    return { id: existing.id, created: false };
  }
  const app = await prisma.screeningApplication.create({ data: { ref: input.ref, ...data } });
  await prisma.screeningEvent.create({ data: { applicationId: app.id, actorId, type: "received", detail: { source } } });
  return { id: app.id, created: true };
}
