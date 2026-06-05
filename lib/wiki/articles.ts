/**
 * Query helpers for the v2 wiki (articles + spine).
 *
 * Server-only. Pulls articles by slug, spine entries with question summaries,
 * category contents, search results, and backlinks. Excludes archived rows.
 */

import prisma from "@/lib/prisma";
import { docToPlainText, type TipTapDoc } from "@/lib/wiki/tiptap";

export const PANELS = ["guideline", "care_plan", "action_manual"] as const;
export type Panel = (typeof PANELS)[number];

export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  kind: string;
};

export type ArticleWithLinks = ArticleSummary & {
  programDomain: string;
  contentJson: TipTapDoc;
  naturalOrder: number;
  updatedAt: Date;
  updatedById: string;
  forkedFromId: string | null;
  links: Record<Panel, ArticleSummary[]>;
  backlinks: { article: ArticleSummary; panel: Panel }[];
};

export type SpineEntry = {
  id: string;
  ordinal: number;
  sectionLabel: string | null;
  article: ArticleSummary & {
    linkCounts: Record<Panel, number>;
  };
};

export type SpineWithEntries = {
  id: string;
  slug: string;
  title: string;
  programDomain: string;
  entries: SpineEntry[];
};

// ── Article lookups ────────────────────────────────────────────────────────

export async function getArticleBySlug(slug: string): Promise<ArticleWithLinks | null> {
  const article = await prisma.wikiArticle.findUnique({
    where: { slug },
    include: {
      outboundLinks: {
        orderBy: [{ panel: "asc" }, { ordinal: "asc" }],
        include: {
          to: {
            select: { id: true, slug: true, title: true, kind: true, archivedAt: true },
          },
        },
      },
      inboundLinks: {
        include: {
          from: {
            select: { id: true, slug: true, title: true, kind: true, archivedAt: true },
          },
        },
      },
    },
  });
  if (!article || article.archivedAt) return null;

  const links: Record<Panel, ArticleSummary[]> = {
    guideline: [],
    care_plan: [],
    action_manual: [],
  };
  for (const link of article.outboundLinks) {
    if (link.to.archivedAt) continue;
    if (!PANELS.includes(link.panel as Panel)) continue;
    links[link.panel as Panel].push({
      id: link.to.id,
      slug: link.to.slug,
      title: link.to.title,
      kind: link.to.kind,
    });
  }

  const backlinks = article.inboundLinks
    .filter((l) => !l.from.archivedAt && PANELS.includes(l.panel as Panel))
    .map((l) => ({
      article: { id: l.from.id, slug: l.from.slug, title: l.from.title, kind: l.from.kind },
      panel: l.panel as Panel,
    }));

  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    kind: article.kind,
    programDomain: article.programDomain,
    contentJson: article.contentJson as unknown as TipTapDoc,
    naturalOrder: article.naturalOrder,
    updatedAt: article.updatedAt,
    updatedById: article.updatedById,
    forkedFromId: article.forkedFromId,
    links,
    backlinks,
  };
}

export async function getArticleById(id: string): Promise<ArticleWithLinks | null> {
  const article = await prisma.wikiArticle.findUnique({
    where: { id },
    select: { slug: true },
  });
  if (!article) return null;
  return getArticleBySlug(article.slug);
}

// ── Fork panel content for a question ──────────────────────────────────────

export async function getForkPanelArticles(
  questionArticleId: string,
  panel: Panel,
): Promise<(ArticleSummary & { contentJson: TipTapDoc })[]> {
  const links = await prisma.wikiArticleLink.findMany({
    where: { fromArticleId: questionArticleId, panel },
    orderBy: { ordinal: "asc" },
    include: {
      to: {
        select: {
          id: true,
          slug: true,
          title: true,
          kind: true,
          contentJson: true,
          archivedAt: true,
        },
      },
    },
  });
  return links
    .filter((l) => !l.to.archivedAt)
    .map((l) => ({
      id: l.to.id,
      slug: l.to.slug,
      title: l.to.title,
      kind: l.to.kind,
      contentJson: l.to.contentJson as unknown as TipTapDoc,
    }));
}

// ── Spine ──────────────────────────────────────────────────────────────────

export async function getSpineBySlug(slug: string): Promise<SpineWithEntries | null> {
  const spine = await prisma.wikiSpine.findUnique({
    where: { slug },
    include: {
      entries: {
        orderBy: { ordinal: "asc" },
        include: {
          article: {
            select: {
              id: true,
              slug: true,
              title: true,
              kind: true,
              archivedAt: true,
              outboundLinks: {
                select: { panel: true },
              },
            },
          },
        },
      },
    },
  });
  if (!spine) return null;

  const entries: SpineEntry[] = spine.entries
    .filter((e) => !e.article.archivedAt)
    .map((e) => {
      const linkCounts: Record<Panel, number> = { guideline: 0, care_plan: 0, action_manual: 0 };
      for (const l of e.article.outboundLinks) {
        if (PANELS.includes(l.panel as Panel)) linkCounts[l.panel as Panel]++;
      }
      return {
        id: e.id,
        ordinal: e.ordinal,
        sectionLabel: e.sectionLabel,
        article: {
          id: e.article.id,
          slug: e.article.slug,
          title: e.article.title,
          kind: e.article.kind,
          linkCounts,
        },
      };
    });

  return {
    id: spine.id,
    slug: spine.slug,
    title: spine.title,
    programDomain: spine.programDomain,
    entries,
  };
}

// ── Categories (articles grouped by kind) ──────────────────────────────────

export const CATEGORY_KINDS: Record<string, { kinds: string[]; title: string; description: string }> = {
  "action-manual":    { kinds: ["chapter"],        title: "Action Manual",          description: "How to do every activity the assessment asks of you." },
  "domain-pathways":  { kinds: ["pathway"],        title: "Domain Pathways",        description: "Standard care pathways per EVA domain." },
  "category-templates": { kinds: ["template"],     title: "Category Templates",     description: "Care plan templates by EVRAT category." },
  framework:          { kinds: ["framework"],      title: "Framework",              description: "Programme principles, scoring, calibration, consent, sensitive-field handling." },
  "flag-protocols":   { kinds: ["flag_protocol"],  title: "Critical Flag Protocols", description: "Mandatory action, timeframe, owner per critical risk flag." },
};

export async function getCategory(
  slug: string,
  programDomain: string,
): Promise<{ slug: string; title: string; description: string; articles: ArticleSummary[] } | null> {
  const cat = CATEGORY_KINDS[slug];
  if (!cat) return null;
  const articles = await prisma.wikiArticle.findMany({
    where: {
      programDomain,
      kind: { in: cat.kinds },
      archivedAt: null,
    },
    orderBy: [{ naturalOrder: "asc" }, { title: "asc" }],
    select: { id: true, slug: true, title: true, kind: true },
  });
  return { slug, title: cat.title, description: cat.description, articles };
}

// ── Programmes badges (Elderly live; others stubs from NeedsFormulaConfig) ─

export type ProgrammeBadge = {
  domain: string;          // e.g. "Elderly"
  label: string;           // display label
  isLive: boolean;         // true if any spine exists for this domain
  spineSlug: string | null;
  articleCount: number;
};

export async function getProgrammeBadges(): Promise<ProgrammeBadge[]> {
  const [configs, spines, counts] = await Promise.all([
    prisma.needsFormulaConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { domain: true, label: true },
    }),
    prisma.wikiSpine.findMany({
      select: { slug: true, programDomain: true },
    }),
    prisma.wikiArticle.groupBy({
      by: ["programDomain"],
      where: { archivedAt: null },
      _count: { _all: true },
    }),
  ]);

  const spineByDomain = new Map(spines.map((s) => [s.programDomain, s.slug]));
  const countByDomain = new Map(counts.map((c) => [c.programDomain, c._count._all]));

  // If "Elderly" isn't in NeedsFormulaConfig yet, surface it anyway since we
  // have content for it.
  const domains = new Map<string, string>();
  for (const c of configs) domains.set(c.domain, c.label ?? c.domain);
  if (countByDomain.has("Elderly") && !domains.has("Elderly")) {
    domains.set("Elderly", "Elderly");
  }

  return [...domains.entries()].map(([domain, label]) => {
    const spineSlug = spineByDomain.get(domain) ?? null;
    const articleCount = countByDomain.get(domain) ?? 0;
    return {
      domain,
      label,
      isLive: !!spineSlug && articleCount > 0,
      spineSlug,
      articleCount,
    };
  });
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchArticles(
  q: string,
  programDomain?: string,
  limit = 20,
): Promise<(ArticleSummary & { snippet: string })[]> {
  const query = q.trim();
  if (!query) return [];
  const results = await prisma.wikiArticle.findMany({
    where: {
      archivedAt: null,
      ...(programDomain ? { programDomain } : {}),
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { slug: { contains: query.toLowerCase(), mode: "insensitive" } },
      ],
    },
    take: limit,
    orderBy: [{ title: "asc" }],
    select: { id: true, slug: true, title: true, kind: true, contentJson: true },
  });
  return results.map((r) => {
    const plain = docToPlainText(r.contentJson as unknown as TipTapDoc);
    const lower = plain.toLowerCase();
    const qLower = query.toLowerCase();
    const idx = lower.indexOf(qLower);
    const start = idx >= 0 ? Math.max(0, idx - 40) : 0;
    const snippet = plain.slice(start, start + 180);
    return { id: r.id, slug: r.slug, title: r.title, kind: r.kind, snippet };
  });
}
