/**
 * The screening rubric: what an application is scored on, and how the scores
 * combine.
 *
 * A rubric is a list of dimensions, each scored 1–5 by a reviewer. The same
 * dimensions are the axes of the profile chart. There is a default rubric and,
 * optionally, one per geography; a geography without its own uses the default.
 * Everything here is editable in Screening → Settings — nothing about the
 * scoring is fixed in code except the arithmetic.
 *
 * Total = Σ (score ÷ 5) × weight, scaled to 100 when the weights don't add to
 * 100. Group applications use each dimension's group weight, and only group
 * applications are scored on group-only dimensions.
 */

import prisma from "@/lib/prisma";

export type Dimension = {
  key: string;
  label: string;
  /** What the dimension is about — shown to reviewers and given to the AI draft. */
  description: string;
  weight: number;
  /** Weight when the application is from a group. */
  groupWeight: number;
  /** Scored for group applications only. */
  groupOnly: boolean;
  /** What a 1, 3 and 5 look like. */
  anchors: { "1": string; "3": string; "5": string };
};

export type Rubric = {
  /** "default" or a geography key. */
  key: string;
  version: number;
  dimensions: Dimension[];
  guidance: string;
  /** True when this geography has no rubric of its own and the default is standing in. */
  inherited: boolean;
};

export type Scores = Record<string, number>;

/**
 * The starting rubric, from the programme's screening design: five dimensions
 * for individuals (25/20/20/20/15) and a sixth for groups, with the group
 * weights 25/20/20/15/10 + 10. The anchors are a starting point to be replaced
 * with the agreed rubric wording.
 */
export const DEFAULT_DIMENSIONS: Dimension[] = [
  {
    key: "community",
    label: "Community understanding",
    description:
      "Knowledge of the communities in the chosen geography: who they are, their most pressing needs, and how the applicant knows this.",
    weight: 25,
    groupWeight: 25,
    groupOnly: false,
    anchors: {
      "1": "General statements about communities with no specific people, places or needs.",
      "3": "Names specific communities and needs, with some first-hand basis.",
      "5": "Specific, first-hand and well-evidenced account of communities and their needs in the chosen location.",
    },
  },
  {
    key: "motivation",
    label: "Founder motivation and readiness",
    description:
      "Why the applicant wants to establish their own organisation, why now, and readiness to register and run it.",
    weight: 20,
    groupWeight: 20,
    groupOnly: false,
    anchors: {
      "1": "No clear reason to found an organisation; reads as a job search.",
      "3": "A stated reason and some sign of readiness.",
      "5": "A clear, specific reason grounded in experience, and concrete readiness to register and run the organisation.",
    },
  },
  {
    key: "programme",
    label: "Programme thinking",
    description:
      "The rough two-year plan: the issue addressed, who benefits, and how the work would be carried out. Scored the same for all applicants.",
    weight: 20,
    groupWeight: 20,
    groupOnly: false,
    anchors: {
      "1": "No plan, or a list of activities with no link to a need.",
      "3": "A plan that names an issue, beneficiaries and activities.",
      "5": "A plan that links a specific need to beneficiaries, activities and a realistic way of carrying them out.",
    },
  },
  {
    key: "experience",
    label: "Experience depth and relevance",
    description:
      "Full-time, on-field development-sector experience, how much of it was directly with communities, and its relevance to the proposed work.",
    weight: 20,
    groupWeight: 15,
    groupOnly: false,
    anchors: {
      "1": "Little on-field experience, or experience unrelated to the proposed work.",
      "3": "Several years of on-field work with some relevance.",
      "5": "Substantial community-facing experience directly relevant to the proposed work, with evidence of responsibility.",
    },
  },
  {
    key: "geography",
    label: "Geography fit",
    description:
      "Connection to the chosen geography and location, and commitment to relocate fully and work at the grassroots there.",
    weight: 15,
    groupWeight: 10,
    groupOnly: false,
    anchors: {
      "1": "No connection to the geography and no clear commitment to relocate.",
      "3": "Some connection or a stated commitment to relocate.",
      "5": "A strong connection to the location and a clear commitment to live and work there.",
    },
  },
  {
    key: "group",
    label: "Group complementarity",
    description: "How the group formed, and what each member brings to the organisation.",
    weight: 0,
    groupWeight: 10,
    groupOnly: true,
    anchors: {
      "1": "No account of how the group formed or what each member brings.",
      "3": "Roles are described but overlap or are vague.",
      "5": "Members bring distinct, complementary skills and have worked together before.",
    },
  },
];

export const DEFAULT_KEY = "default";

function parseDimensions(raw: unknown): Dimension[] {
  if (!Array.isArray(raw)) return DEFAULT_DIMENSIONS;
  const out: Dimension[] = [];
  for (const d of raw as Partial<Dimension>[]) {
    const key = String(d?.key || "").trim();
    if (!key) continue;
    out.push({
      key,
      label: String(d.label || key),
      description: String(d.description || ""),
      weight: Number(d.weight) || 0,
      groupWeight: Number(d.groupWeight ?? d.weight) || 0,
      groupOnly: d.groupOnly === true,
      anchors: {
        "1": String(d.anchors?.["1"] || ""),
        "3": String(d.anchors?.["3"] || ""),
        "5": String(d.anchors?.["5"] || ""),
      },
    });
  }
  return out.length ? out : DEFAULT_DIMENSIONS;
}

/** The rubric that applies to a geography: its own, else the default, else the built-in one. */
export async function rubricFor(geoKey: string | null): Promise<Rubric> {
  const rows = await prisma.screeningRubric.findMany({
    where: { key: { in: geoKey ? [geoKey, DEFAULT_KEY] : [DEFAULT_KEY] } },
  });
  const own = geoKey ? rows.find((r) => r.key === geoKey) : undefined;
  const fallback = rows.find((r) => r.key === DEFAULT_KEY);
  const row = own ?? fallback;
  if (!row) return { key: DEFAULT_KEY, version: 0, dimensions: DEFAULT_DIMENSIONS, guidance: "", inherited: !!geoKey };
  return {
    key: row.key,
    version: row.version,
    dimensions: parseDimensions(row.dimensions),
    guidance: row.guidance,
    inherited: !!geoKey && !own,
  };
}

/** The dimensions an application is actually scored on. */
export function activeDimensions(dims: Dimension[], isGroup: boolean): Dimension[] {
  return dims.filter((d) => (isGroup ? d.groupWeight > 0 : !d.groupOnly && d.weight > 0));
}

export function weightOf(d: Dimension, isGroup: boolean): number {
  return isGroup ? d.groupWeight : d.weight;
}

/** Out of 100. Null until every active dimension has a score. */
export function totalScore(dims: Dimension[], scores: Scores, isGroup: boolean): number | null {
  const active = activeDimensions(dims, isGroup);
  const sumW = active.reduce((n, d) => n + weightOf(d, isGroup), 0);
  if (active.length === 0 || sumW === 0) return null;
  let t = 0;
  for (const d of active) {
    const s = scores[d.key];
    if (!(s >= 1 && s <= 5)) return null;
    t += (s / 5) * weightOf(d, isGroup);
  }
  return Math.round((t / sumW) * 1000) / 10;
}

export type Band = "advance" | "hold" | "reject";

export function bandOf(total: number, settings: { advanceMin: number; holdMin: number }): Band {
  if (total >= settings.advanceMin) return "advance";
  if (total >= settings.holdMin) return "hold";
  return "reject";
}

export const BAND_META: Record<Band, { label: string; chip: string }> = {
  advance: { label: "Advance", chip: "bg-emerald-100 text-emerald-700" },
  hold: { label: "Hold — second read", chip: "bg-amber-100 text-amber-700" },
  reject: { label: "Reject", chip: "bg-rose-100 text-rose-700" },
};

export async function screeningSettings() {
  const row = await prisma.screeningSettings.findUnique({ where: { id: 1 } });
  return row ?? { id: 1, advanceMin: 70, holdMin: 50, divergence: 15, dailyCap: 20, aiEnabled: true, updatedAt: new Date(0) };
}
