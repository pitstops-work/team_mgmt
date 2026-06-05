/**
 * Seed loader for the v2 wiki (Elderly programme).
 *
 * Reads scripts/seed-data/wiki-elderly.json and upserts articles + spine +
 * links into the v2 wiki tables. Idempotent: safe to re-run.
 *
 * Edit-safety rule: if an article exists AND has any version row whose
 * `summary` is NOT the seed marker, that means a user has edited it since
 * seed. We preserve the user's body and only sync non-content metadata
 * (title, kind, naturalOrder).
 *
 * Usage:  npx tsx scripts/seed-wiki-elderly.ts
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import prisma from "../lib/prisma";
import { blocksToDoc, type Block, type TipTapDoc } from "../lib/wiki/tiptap";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_FILE = join(__dirname, "seed-data", "wiki-elderly.json");
// Additional article-only chunks live here. Each file: { articles: [...] }.
// Authored in topical batches so the seed scales beyond what a single file
// comfortably holds.
const EXTRAS_DIR = join(__dirname, "seed-data", "wiki-elderly-articles");
const SEED_VERSION_SUMMARY = "Initial seed";

type SeedArticle = {
  slug: string;
  title: string;
  kind: string;
  naturalOrder?: number;
  content: Block[];
  links?: {
    guideline?: string[];
    care_plan?: string[];
    action_manual?: string[];
  };
};

type SeedSpineEntry = {
  articleSlug: string;
  ordinal?: number;
  sectionLabel?: string | null;
};

type SeedSpine = {
  slug: string;
  title: string;
  entries: SeedSpineEntry[];
};

type SeedFile = {
  programDomain: string;
  spine: SeedSpine;
  articles: SeedArticle[];
};

async function getSystemUserId(): Promise<string> {
  // Prefer an admin user; fall back to the earliest user.
  const admin = await prisma.user.findFirst({
    where: { role: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (admin) return admin.id;
  const any = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!any) throw new Error("No users in database — cannot attribute seed.");
  return any.id;
}

async function main() {
  const raw = readFileSync(SEED_FILE, "utf-8");
  const seed: SeedFile = JSON.parse(raw);

  // Merge in any topical chunks under wiki-elderly-articles/.
  if (existsSync(EXTRAS_DIR)) {
    const files = readdirSync(EXTRAS_DIR)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const f of files) {
      const extra = JSON.parse(readFileSync(join(EXTRAS_DIR, f), "utf-8")) as { articles?: SeedArticle[] };
      const count = extra.articles?.length ?? 0;
      if (count > 0) {
        seed.articles = seed.articles.concat(extra.articles!);
        console.log(`  + ${count} from ${f}`);
      }
    }
  }

  // De-dupe by slug — later files override earlier ones.
  const bySlug = new Map<string, SeedArticle>();
  for (const a of seed.articles) bySlug.set(a.slug, a);
  seed.articles = [...bySlug.values()];

  const systemUserId = await getSystemUserId();
  console.log(`Seeding ${seed.articles.length} articles for programme "${seed.programDomain}" (actor=${systemUserId})`);

  let created = 0;
  let updated = 0;
  let skippedBody = 0;

  // ── 1. Articles ──────────────────────────────────────────────────────────
  for (const art of seed.articles) {
    const doc: TipTapDoc = blocksToDoc(art.content);
    const existing = await prisma.wikiArticle.findUnique({
      where: { slug: art.slug },
      include: { _count: { select: { versions: true } } },
    });

    if (!existing) {
      const fresh = await prisma.wikiArticle.create({
        data: {
          slug: art.slug,
          title: art.title,
          kind: art.kind,
          programDomain: seed.programDomain,
          naturalOrder: art.naturalOrder ?? 0,
          contentJson: doc as unknown as object,
          createdById: systemUserId,
          updatedById: systemUserId,
        },
      });
      await prisma.wikiArticleVersion.create({
        data: {
          articleId: fresh.id,
          versionNumber: 1,
          title: art.title,
          contentJson: doc as unknown as object,
          savedById: systemUserId,
          summary: SEED_VERSION_SUMMARY,
        },
      });
      created++;
      continue;
    }

    // Re-seed path: check whether any user edits exist (any non-seed version).
    const userEdit = await prisma.wikiArticleVersion.findFirst({
      where: { articleId: existing.id, summary: { not: SEED_VERSION_SUMMARY } },
      select: { id: true },
    });

    if (userEdit) {
      // Preserve user body; only sync metadata.
      await prisma.wikiArticle.update({
        where: { id: existing.id },
        data: {
          title: art.title,
          kind: art.kind,
          programDomain: seed.programDomain,
          naturalOrder: art.naturalOrder ?? 0,
          updatedById: systemUserId,
        },
      });
      skippedBody++;
    } else {
      // No user edits → safe to overwrite body, write a new seed version.
      const nextVersion = existing._count.versions + 1;
      await prisma.wikiArticle.update({
        where: { id: existing.id },
        data: {
          title: art.title,
          kind: art.kind,
          programDomain: seed.programDomain,
          naturalOrder: art.naturalOrder ?? 0,
          contentJson: doc as unknown as object,
          updatedById: systemUserId,
        },
      });
      await prisma.wikiArticleVersion.create({
        data: {
          articleId: existing.id,
          versionNumber: nextVersion,
          title: art.title,
          contentJson: doc as unknown as object,
          savedById: systemUserId,
          summary: SEED_VERSION_SUMMARY,
        },
      });
      updated++;
    }
  }

  // Reload all articles into a slug→id map for the link + spine passes.
  const allArticles = await prisma.wikiArticle.findMany({
    where: { programDomain: seed.programDomain },
    select: { id: true, slug: true },
  });
  const slugToId = new Map(allArticles.map((a) => [a.slug, a.id]));

  // ── 2. Links (replace per fromArticle × panel) ──────────────────────────
  let linksCreated = 0;
  let linksWarn = 0;
  const PANELS = ["guideline", "care_plan", "action_manual"] as const;

  for (const art of seed.articles) {
    if (!art.links) continue;
    const fromId = slugToId.get(art.slug);
    if (!fromId) continue;

    for (const panel of PANELS) {
      const slugs = art.links[panel] ?? [];
      // Always delete-and-recreate so removed seed links go away cleanly.
      await prisma.wikiArticleLink.deleteMany({
        where: { fromArticleId: fromId, panel },
      });
      for (let i = 0; i < slugs.length; i++) {
        const toId = slugToId.get(slugs[i]);
        if (!toId) {
          console.warn(`  [link] target not found: ${art.slug} -> ${panel} -> ${slugs[i]}`);
          linksWarn++;
          continue;
        }
        await prisma.wikiArticleLink.create({
          data: { fromArticleId: fromId, toArticleId: toId, panel, ordinal: i },
        });
        linksCreated++;
      }
    }
  }

  // ── 3. Spine (replace entries by slug) ──────────────────────────────────
  const spine = await prisma.wikiSpine.upsert({
    where: { slug: seed.spine.slug },
    update: { title: seed.spine.title, programDomain: seed.programDomain },
    create: {
      slug: seed.spine.slug,
      title: seed.spine.title,
      programDomain: seed.programDomain,
    },
  });
  await prisma.wikiSpineEntry.deleteMany({ where: { spineId: spine.id } });

  let entriesCreated = 0;
  let entriesWarn = 0;
  for (let i = 0; i < seed.spine.entries.length; i++) {
    const entry = seed.spine.entries[i];
    const articleId = slugToId.get(entry.articleSlug);
    if (!articleId) {
      console.warn(`  [spine] article not found: ${entry.articleSlug}`);
      entriesWarn++;
      continue;
    }
    await prisma.wikiSpineEntry.create({
      data: {
        spineId: spine.id,
        ordinal: entry.ordinal ?? (i + 1) * 10,
        articleId,
        sectionLabel: entry.sectionLabel ?? null,
      },
    });
    entriesCreated++;
  }

  console.log("");
  console.log("── Seed complete ──────────────────────────────────────────");
  console.log(`Articles: ${created} created, ${updated} updated, ${skippedBody} preserved (user edits)`);
  console.log(`Links:    ${linksCreated} created${linksWarn ? `, ${linksWarn} warnings` : ""}`);
  console.log(`Spine:    ${entriesCreated} entries${entriesWarn ? `, ${entriesWarn} warnings` : ""}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
