// Outreach layer — pure helpers. Chip metadata (mirrors _lib/status.ts), the
// name-normaliser that backs paste-import dedupe, and the TSV parser shared by
// the client preview and the server action (the server always re-parses; the
// client's parse is only ever a preview).

import type {
  SeedingChannelKind,
  SeedingChannelStage,
  SeedingSessionKind,
  SeedingSessionStatus,
  SeedingLeadStage,
} from "@/app/generated/prisma/client";

type Meta = { label: string; chip: string; dot: string };

export const CHANNEL_KIND_META: Record<SeedingChannelKind, Meta & { hint: string }> = {
  institution:     { label: "Institution",    chip: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500", hint: "College, university, ITI, school" },
  alumni_network:  { label: "Alumni network", chip: "bg-violet-100 text-violet-700", dot: "bg-violet-500", hint: "Alumni association or chapter" },
  partner_org:     { label: "Partner org",    chip: "bg-teal-100 text-teal-700",     dot: "bg-teal-500",   hint: "NGO / CSO / CSR partner" },
  forum_community: { label: "Forum",          chip: "bg-amber-100 text-amber-700",   dot: "bg-amber-500",  hint: "Youth forum, collective, WhatsApp group, federation" },
  govt_body:       { label: "Govt body",      chip: "bg-sky-100 text-sky-700",       dot: "bg-sky-500",    hint: "District admin, NYK, skill mission" },
  digital_channel: { label: "Digital",        chip: "bg-stone-100 text-stone-600",   dot: "bg-stone-400",  hint: "An owned or borrowed broadcast surface" },
};

export const CHANNEL_KIND_ORDER: SeedingChannelKind[] = [
  "institution", "alumni_network", "partner_org", "forum_community", "govt_body", "digital_channel",
];

/** rank orders the monotonic part of the lifecycle; `dropped` sits outside it. */
export const CHANNEL_STAGE_META: Record<SeedingChannelStage, Meta & { rank: number }> = {
  identified: { label: "Identified", chip: "bg-stone-100 text-stone-500",     dot: "bg-stone-300",   rank: 0 },
  contacted:  { label: "Contacted",  chip: "bg-sky-100 text-sky-700",         dot: "bg-sky-500",     rank: 1 },
  responded:  { label: "Responded",  chip: "bg-indigo-100 text-indigo-700",   dot: "bg-indigo-500",  rank: 2 },
  agreed:     { label: "Agreed",     chip: "bg-amber-100 text-amber-700",     dot: "bg-amber-500",   rank: 3 },
  active:     { label: "Active",     chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500", rank: 4 },
  dropped:    { label: "Dropped",    chip: "bg-rose-100 text-rose-700",       dot: "bg-rose-500",    rank: -1 },
};

export const CHANNEL_STAGE_ORDER: SeedingChannelStage[] = [
  "identified", "contacted", "responded", "agreed", "active", "dropped",
];

/** Stages that count as "we can run sessions here" — the activate target. */
export const ACTIVE_STAGES: SeedingChannelStage[] = ["agreed", "active"];

export const SESSION_KIND_META: Record<SeedingSessionKind, Meta> = {
  campus_session: { label: "Campus session", chip: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  webinar:        { label: "Webinar",        chip: "bg-sky-100 text-sky-700",       dot: "bg-sky-500" },
  info_desk:      { label: "Info desk",      chip: "bg-teal-100 text-teal-700",     dot: "bg-teal-500" },
  meeting:        { label: "Meeting",        chip: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  digital_blast:  { label: "Digital blast",  chip: "bg-stone-100 text-stone-600",   dot: "bg-stone-400" },
  other:          { label: "Other",          chip: "bg-stone-100 text-stone-600",   dot: "bg-stone-400" },
};

export const SESSION_KIND_ORDER: SeedingSessionKind[] = [
  "campus_session", "webinar", "info_desk", "meeting", "digital_blast", "other",
];

export const SESSION_STATUS_META: Record<SeedingSessionStatus, Meta> = {
  planned:   { label: "Planned",   chip: "bg-sky-100 text-sky-700",         dot: "bg-sky-500" },
  held:      { label: "Held",      chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  cancelled: { label: "Cancelled", chip: "bg-stone-100 text-stone-500",     dot: "bg-stone-300" },
};

export const SESSION_STATUS_ORDER: SeedingSessionStatus[] = ["planned", "held", "cancelled"];

export const LEAD_STAGE_META: Record<SeedingLeadStage, Meta> = {
  captured: { label: "Captured", chip: "bg-stone-100 text-stone-500",     dot: "bg-stone-300" },
  nurtured: { label: "Nurtured", chip: "bg-sky-100 text-sky-700",         dot: "bg-sky-500" },
  applied:  { label: "Applied",  chip: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  dropped:  { label: "Dropped",  chip: "bg-rose-100 text-rose-700",       dot: "bg-rose-500" },
};

export const LEAD_STAGE_ORDER: SeedingLeadStage[] = ["captured", "nurtured", "applied", "dropped"];

/** The label used wherever a null geoId shows up in a geo column. */
export const CENTRAL_LABEL = "Central / national";
/** Sentinel used in <select> and searchParams for the null-geo bucket. */
export const CENTRAL_KEY = "central";

// ── Dedupe key ───────────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, collapse whitespace. Backs @@unique([geoId, nameKey])
 *  so a re-paste of the same spreadsheet creates nothing. */
export function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ── Paste-TSV import ─────────────────────────────────────────────────────────

export const IMPORT_COLUMNS = [
  "name", "kind", "subGeo", "stage", "district", "address",
  "contactName", "contactRole", "contactPhone", "contactEmail",
  "externalCode", "estimatedReach", "websiteUrl", "notes",
] as const;

export const MAX_IMPORT_ROWS = 500;

export type ParsedChannelRow = {
  line: number;
  name: string;
  nameKey: string;
  kind: SeedingChannelKind;
  stage: SeedingChannelStage;
  subGeoLabel: string | null;
  district: string | null;
  address: string | null;
  contactName: string | null;
  contactRole: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  externalCode: string | null;
  estimatedReach: number | null;
  websiteUrl: string | null;
  notes: string | null;
};

export type ImportIssue = { line: number; message: string };
export type ChannelTsvParse = { rows: ParsedChannelRow[]; errors: ImportIssue[] };
export type ImportResult = { created: number; skipped: number; errors: ImportIssue[] };

const headerKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Accepts either the enum value or a friendly label ("College" → institution). */
const KIND_ALIASES: Record<string, SeedingChannelKind> = {
  college: "institution", university: "institution", school: "institution",
  iti: "institution", campus: "institution", institute: "institution",
  alumni: "alumni_network", alumninetwork: "alumni_network", alumnigroup: "alumni_network",
  ngo: "partner_org", cso: "partner_org", partner: "partner_org", partnerorg: "partner_org",
  forum: "forum_community", community: "forum_community", collective: "forum_community",
  group: "forum_community", whatsappgroup: "forum_community",
  govt: "govt_body", government: "govt_body", govtbody: "govt_body", department: "govt_body",
  digital: "digital_channel", digitalchannel: "digital_channel", social: "digital_channel",
};

export function resolveKind(raw: string): SeedingChannelKind | null {
  const k = headerKey(raw);
  if (!k) return null;
  if (k in CHANNEL_KIND_META) return k as SeedingChannelKind;
  const direct = CHANNEL_KIND_ORDER.find((v) => headerKey(v) === k);
  if (direct) return direct;
  const byLabel = CHANNEL_KIND_ORDER.find((v) => headerKey(CHANNEL_KIND_META[v].label) === k);
  if (byLabel) return byLabel;
  return KIND_ALIASES[k] ?? null;
}

function resolveStage(raw: string): SeedingChannelStage | null {
  const k = headerKey(raw);
  if (!k) return null;
  return CHANNEL_STAGE_ORDER.find((v) => headerKey(v) === k || headerKey(CHANNEL_STAGE_META[v].label) === k) ?? null;
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

/**
 * Parse a clipboard paste from Excel/Sheets. First non-empty line is the header
 * row; columns are matched case- and punctuation-insensitively in any order and
 * unknown columns are ignored. Tab-separated by default; falls back to comma
 * only when the header line contains no tab.
 */
export function parseChannelTsv(text: string): ChannelTsvParse {
  const rows: ParsedChannelRow[] = [];
  const errors: ImportIssue[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  const headerIdx = lines.findIndex((l) => l.trim().length > 0);
  if (headerIdx === -1) return { rows, errors: [{ line: 1, message: "Nothing pasted." }] };

  const sep = lines[headerIdx].includes("\t") ? "\t" : ",";
  const header = lines[headerIdx].split(sep).map(headerKey);
  const colIndex: Partial<Record<(typeof IMPORT_COLUMNS)[number], number>> = {};
  for (const col of IMPORT_COLUMNS) {
    const i = header.indexOf(headerKey(col));
    if (i !== -1) colIndex[col] = i;
  }
  if (colIndex.name === undefined) {
    return { rows, errors: [{ line: headerIdx + 1, message: 'Header row must include a "name" column.' }] };
  }
  if (colIndex.kind === undefined) {
    return { rows, errors: [{ line: headerIdx + 1, message: 'Header row must include a "kind" column.' }] };
  }

  const at = (cells: string[], col: (typeof IMPORT_COLUMNS)[number]): string | undefined => {
    const i = colIndex[col];
    return i === undefined ? undefined : cells[i];
  };

  const seen = new Set<string>();
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const line = i + 1;
    if (rows.length >= MAX_IMPORT_ROWS) {
      errors.push({ line, message: `More than ${MAX_IMPORT_ROWS} rows — split the paste.` });
      break;
    }
    const cells = raw.split(sep);
    const name = clean(at(cells, "name"));
    if (!name) { errors.push({ line, message: "Missing name." }); continue; }

    const kind = resolveKind(at(cells, "kind") ?? "");
    if (!kind) {
      errors.push({ line, message: `Unknown kind "${(at(cells, "kind") ?? "").trim()}" — use one of ${CHANNEL_KIND_ORDER.join(", ")}.` });
      continue;
    }

    const nameKey = normaliseName(name);
    if (seen.has(nameKey)) { errors.push({ line, message: `Duplicate of an earlier row ("${name}").` }); continue; }
    seen.add(nameKey);

    const stageRaw = clean(at(cells, "stage"));
    const stage = stageRaw ? resolveStage(stageRaw) : "identified";
    if (!stage) { errors.push({ line, message: `Unknown stage "${stageRaw}".` }); continue; }

    const reachRaw = clean(at(cells, "estimatedReach"));
    const estimatedReach = reachRaw ? Number.parseInt(reachRaw.replace(/[^0-9]/g, ""), 10) : NaN;

    rows.push({
      line,
      name,
      nameKey,
      kind,
      stage,
      subGeoLabel: clean(at(cells, "subGeo")),
      district: clean(at(cells, "district")),
      address: clean(at(cells, "address")),
      contactName: clean(at(cells, "contactName")),
      contactRole: clean(at(cells, "contactRole")),
      contactPhone: clean(at(cells, "contactPhone")),
      contactEmail: clean(at(cells, "contactEmail")),
      externalCode: clean(at(cells, "externalCode")),
      estimatedReach: Number.isFinite(estimatedReach) && estimatedReach > 0 ? estimatedReach : null,
      websiteUrl: clean(at(cells, "websiteUrl")),
      notes: clean(at(cells, "notes")),
    });
  }

  return { rows, errors };
}
