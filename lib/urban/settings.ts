// Programme settings (spec §4). A programme IS this document: adding a new kind
// of work means writing settings, not code. Validated on every save; the rest of
// /urban only ever reads a parsed ProgrammeSettings.
//
// Pure (zod only): safe in client components, so the editor can validate as
// you type with the exact rules the server enforces.
import { z } from "zod";

export const CHECK_TYPES = ["tick", "voice", "photo", "rating", "number", "observation", "note"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export const CHECK_LABEL: Record<CheckType, string> = {
  tick: "Tick",
  voice: "Voice note",
  photo: "Photo / file",
  rating: "Rating",
  number: "Number",
  observation: "Observation",
  note: "Note",
};

export const PLACE_LEVELS = ["city", "zone", "cluster", "settlement", "site"] as const;
export type PlaceLevel = (typeof PLACE_LEVELS)[number];

export const START_MODES = ["new", "already_running"] as const;
export type StartMode = (typeof START_MODES)[number];

const key = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "lowercase letters, digits, - and _ only");

/** One point of a rating list (e.g. the 24-point creche safety audit) or an observation list. */
const pointSchema = z.object({
  key,
  text: z.string().min(1),
  category: z.string().optional(),
  /** Rated "Not OK" ⇒ a follow-up is raised automatically. */
  non_negotiable: z.boolean().optional(),
  na_allowed: z.boolean().optional(),
  /** Free extra fields kept for display, e.g. subcategory, training module. */
  meta: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});

const itemSchema = z
  .object({
    key,
    title: z.string().min(1),
    check: z.enum(CHECK_TYPES),
    required: z.boolean().default(true),
    /** Setup items only: days after the effort's start date. */
    due_in_days: z.number().int().min(0).max(3650).optional(),
    /** Setup items only: a different due day for already-running efforts (e.g. a catch-up item). Defaults to due_in_days. */
    due_in_days_running: z.number().int().min(0).max(3650).optional(),
    /** Setup items only: which efforts get this item. */
    applies_to: z.enum(["new", "already_running", "both"]).default("new"),
    /** rating / observation: the name of a list in `lists`. */
    list: key.optional(),
    /** number: the reading this records. */
    reading: key.optional(),
    /** Shown under the title. */
    hint: z.string().optional(),
  })
  .strict();

const phaseSchema = z.object({ phase: z.string().min(1), items: z.array(itemSchema).min(1) }).strict();

const routineSchema = z
  .object({
    key,
    name: z.string().min(1),
    cadence: z.enum(["weekly", "fortnightly", "monthly"]),
    mode: z.enum(["visit", "meeting", "call"]),
    items: z.array(itemSchema.omit({ due_in_days: true, due_in_days_running: true, applies_to: true })).min(1),
  })
  .strict();

const readingSchema = z
  .object({
    key,
    label: z.string().min(1),
    unit: z.string().optional(),
    /** Counts toward "delivered" on the Programme screen. */
    outcome: z.boolean().default(false),
    /** Recorded once per value of this dimension (e.g. per scheme). */
    per: key.optional(),
  })
  .strict();

const needSchema = z.discriminatedUnion("type", [
  /** e.g. creche: floor(population ÷ per_unit) − existing, per settlement. */
  z.object({ type: z.literal("count"), population: z.string(), per_unit: z.number().positive(), existing: z.string().optional() }).strict(),
  /** e.g. entitlements: received ÷ eligible, per dimension value. */
  z.object({ type: z.literal("saturation"), eligible: key, received: key, per: key }).strict(),
  /** Covered or not: does the place have a running effort. */
  z.object({ type: z.literal("coverage") }).strict(),
]);

export const settingsSchema = z
  .object({
    description: z.string().optional(),
    place_level: z.enum(PLACE_LEVELS),
    partner_mis: z.string().optional(),
    /** A city-level effort may span partners (e.g. the all-partner meeting). */
    partner_optional: z.boolean().default(false),
    setup: z.array(phaseSchema).default([]),
    routines: z.array(routineSchema).default([]),
    readings: z.array(readingSchema).default([]),
    /** Named point lists used by rating / observation items. */
    lists: z.record(key, z.array(pointSchema).min(1)).default({}),
    /** Values of a reading dimension, e.g. dimensions.scheme = the schemes. */
    dimensions: z.record(key, z.array(z.object({ key, label: z.string().min(1) }).strict()).min(1)).default({}),
    need: needSchema.optional(),
    /** For a later MIS sync. The pilot enters readings by hand. */
    integration: z.object({ source: z.string(), notes: z.string().optional() }).strict().optional(),
  })
  .strict()
  .superRefine((s, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    const readingKeys = new Set(s.readings.map((r) => r.key));
    const checkItem = (it: z.infer<typeof itemSchema> | Omit<z.infer<typeof itemSchema>, "due_in_days" | "due_in_days_running" | "applies_to">, path: (string | number)[]) => {
      if ((it.check === "rating" || it.check === "observation") && (!it.list || !s.lists[it.list])) {
        issue([...path, "list"], `${it.check} needs "list" naming one of: ${Object.keys(s.lists).join(", ") || "(no lists defined)"}`);
      }
      if (it.check === "number" && (!it.reading || !readingKeys.has(it.reading))) {
        issue([...path, "reading"], `number needs "reading" naming one of: ${[...readingKeys].join(", ") || "(no readings defined)"}`);
      }
    };

    const setupKeys = new Set<string>();
    s.setup.forEach((ph, pi) =>
      ph.items.forEach((it, ii) => {
        const path = ["setup", pi, "items", ii];
        if (setupKeys.has(it.key)) issue([...path, "key"], `duplicate setup item key "${it.key}"`);
        setupKeys.add(it.key);
        if (it.due_in_days === undefined) issue([...path, "due_in_days"], "setup items need due_in_days");
        checkItem(it, path);
      }),
    );

    const routineKeys = new Set<string>();
    s.routines.forEach((r, ri) => {
      if (routineKeys.has(r.key)) issue(["routines", ri, "key"], `duplicate routine key "${r.key}"`);
      routineKeys.add(r.key);
      const itemKeys = new Set<string>();
      r.items.forEach((it, ii) => {
        if (itemKeys.has(it.key)) issue(["routines", ri, "items", ii, "key"], `duplicate item key "${it.key}" in routine "${r.key}"`);
        itemKeys.add(it.key);
        checkItem(it, ["routines", ri, "items", ii]);
      });
    });

    s.readings.forEach((r, i) => {
      if (r.per && !s.dimensions[r.per]) issue(["readings", i, "per"], `"per: ${r.per}" needs dimensions.${r.per}`);
    });
    if (s.need?.type === "saturation") {
      for (const k of [s.need.eligible, s.need.received]) if (!readingKeys.has(k)) issue(["need"], `need refers to unknown reading "${k}"`);
      if (!s.dimensions[s.need.per]) issue(["need", "per"], `need.per needs dimensions.${s.need.per}`);
    }
  });

export type ProgrammeSettings = z.infer<typeof settingsSchema>;
export type SetupItem = ProgrammeSettings["setup"][number]["items"][number];
export type Routine = ProgrammeSettings["routines"][number];
export type ListPoint = z.infer<typeof pointSchema>;

export type SettingsResult = { ok: true; settings: ProgrammeSettings } | { ok: false; errors: string[] };

/** Validate settings (an object, or JSON text). Errors are human-readable "path: message" lines. */
export function parseSettings(input: unknown): SettingsResult {
  let value = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (e) {
      return { ok: false, errors: [`Not valid JSON: ${e instanceof Error ? e.message : String(e)}`] };
    }
  }
  const r = settingsSchema.safeParse(value);
  if (r.success) return { ok: true, settings: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}`),
  };
}

/** The setup items an effort starting in `mode` gets, with their phase and the due day for that mode. */
export function setupItemsFor(s: ProgrammeSettings, mode: StartMode): (SetupItem & { phase: string; order: number; dueDay: number })[] {
  const out: (SetupItem & { phase: string; order: number; dueDay: number })[] = [];
  for (const ph of s.setup) {
    for (const it of ph.items) {
      if (it.applies_to !== "both" && it.applies_to !== mode) continue;
      const dueDay = (mode === "already_running" ? it.due_in_days_running ?? it.due_in_days : it.due_in_days) ?? 0;
      out.push({ ...it, phase: ph.phase, order: out.length, dueDay });
    }
  }
  return out;
}

/** checkConfig stored on a task: what the check needs at run time, copied from settings. */
export function checkConfigFor(s: ProgrammeSettings, it: Pick<SetupItem, "check" | "list" | "reading" | "hint">): Record<string, unknown> | null {
  const cfg: Record<string, unknown> = {};
  if (it.list) cfg.list = it.list;
  if (it.reading) {
    cfg.reading = it.reading;
    const r = s.readings.find((x) => x.key === it.reading);
    if (r?.per) cfg.per = r.per;
  }
  if (it.hint) cfg.hint = it.hint;
  return Object.keys(cfg).length ? cfg : null;
}

/** Settings as editable JSON, in reading order (Postgres jsonb sorts keys alphabetically, which buries setup under 1,000 lines of lists). */
const KEY_ORDER = ["description", "place_level", "partner_mis", "partner_optional", "setup", "routines", "readings", "need", "dimensions", "integration", "lists"];
export function settingsToJson(settings: unknown): string {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return JSON.stringify(settings, null, 2);
  const src = settings as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const k of KEY_ORDER) if (k in src) ordered[k] = src[k];
  for (const k of Object.keys(src)) if (!(k in ordered)) ordered[k] = src[k];
  return JSON.stringify(ordered, null, 2);
}
