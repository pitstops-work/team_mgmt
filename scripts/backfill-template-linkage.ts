/**
 * Backfill `templateSlug` + `templateKey` linkage on Pitstop / ChecklistItem /
 * PitstopEvent rows so the template-sync engine can recognise instances created
 * before linkage was stamped (or via paths that skipped it).
 *
 * Matching strategy (per pitstop / item / activity):
 *   1. Already linked? Leave alone.
 *   2. `slugify(instance.title)` == slot/item/activity effectiveKey → link.
 *   3. Explicit prefix override (for renames where the slug doesn't match) → link.
 *
 * Configure templates + per-template scope below in TEMPLATES.
 *
 * Usage:
 *   npx tsx scripts/backfill-template-linkage.ts                # dry run all
 *   npx tsx scripts/backfill-template-linkage.ts --apply        # write all
 *   npx tsx scripts/backfill-template-linkage.ts --only <slug>  # filter to one
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const ONLY_IDX = process.argv.indexOf("--only");
const ONLY_SLUG = ONLY_IDX >= 0 ? process.argv[ONLY_IDX + 1] : null;

type TemplateConfig = {
  templateSlug: string;
  goalTitleIncludes: string;          // case-insensitive substring
  goalTitleExcludes?: string[];       // optional substring exclusions
  slotPrefixOverrides?: Array<{ slotKey: string; titlePrefix: string }>; // for renames
};

const TEMPLATES: TemplateConfig[] = [
  // ── "(Existing)" templates ──────────────────────────────────────────────
  {
    templateSlug: "youth-resource-centre-existing",
    goalTitleIncludes: "youth resource centre (existing)",
    // Instance pitstop "Saturday Centre Visit & CAP Review" → slot
    // "Youth Centre Visit & Community Action Project Review"
    slotPrefixOverrides: [
      { slotKey: "youth-centre-visit-community-action-project-review", titlePrefix: "saturday centre visit" },
    ],
  },
  {
    templateSlug: "partner-management-existing",
    goalTitleIncludes: "partner relationship management (existing)",
  },

  // ── Setup-flow templates with stragglers ────────────────────────────────
  {
    templateSlug: "children-learning-centre",
    goalTitleIncludes: "children learning centre",
    goalTitleExcludes: ["(existing)", "(handholding)"],
  },
  {
    templateSlug: "youth-resource-centre",
    goalTitleIncludes: "youth resource centre",
    goalTitleExcludes: ["(existing)"],
  },
  {
    templateSlug: "welfare-rights",
    goalTitleIncludes: "welfare rights programme",
  },
  {
    templateSlug: "elderly-centre",
    goalTitleIncludes: "elderly care centre",
    goalTitleExcludes: ["(existing)"],
  },
  {
    templateSlug: "water-atm",
    goalTitleIncludes: "water atm",
    goalTitleExcludes: ["(existing)"],
  },
  {
    templateSlug: "food-distribution-launch",
    goalTitleIncludes: "launch & operationalisation",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────
function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
// Mirror lib/templateDb.ts:slugifyChecklistText so we match the same way the
// runtime computes effectiveKey for slots/items/activities without explicit keys.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
function effectiveKey(explicit: string | null | undefined, fallback: string): string {
  return (explicit ?? "").trim() || slugify(fallback);
}

type TplActivity = { key: string; title: string };
type TplItem = {
  key: string;
  text: string;
  activityByKey: Map<string, TplActivity>;
};
type TplSlot = {
  key: string;
  title: string;
  itemByKey: Map<string, TplItem>;
};

async function loadTemplate(prisma: PrismaClient, cfg: TemplateConfig): Promise<{ name: string; slots: TplSlot[] } | null> {
  const t = await prisma.goalTemplateDef.findUnique({
    where: { slug: cfg.templateSlug },
    select: { name: true, pitstops: true },
  });
  if (!t) return null;
  type RawSlot = {
    key?: string; title: string;
    checklist?: Array<{
      key?: string; text: string;
      activities?: Array<{ key?: string; title: string }>;
      activityKey?: string; activityTitle?: string;
    }>;
  };
  const slots: TplSlot[] = [];
  for (const raw of ((t.pitstops as unknown as RawSlot[]) ?? [])) {
    const itemByKey = new Map<string, TplItem>();
    for (const item of raw.checklist ?? []) {
      const itemKey = effectiveKey(item.key, item.text);
      if (!itemKey) continue;
      const activityByKey = new Map<string, TplActivity>();
      const acts = item.activities ?? (item.activityTitle ? [{ key: item.activityKey, title: item.activityTitle }] : []);
      for (const a of acts) {
        if (!a.title) continue;
        const ak = effectiveKey(a.key, a.title);
        if (!ak) continue;
        activityByKey.set(ak, { key: ak, title: a.title });
      }
      itemByKey.set(itemKey, { key: itemKey, text: item.text, activityByKey });
    }
    slots.push({ key: effectiveKey(raw.key, raw.title), title: raw.title, itemByKey });
  }
  return { name: t.name, slots };
}

function matchSlot(slots: TplSlot[], instanceTitle: string, overrides?: TemplateConfig["slotPrefixOverrides"]): TplSlot | null {
  const slug = slugify(instanceTitle);
  if (slug) {
    const hit = slots.find(s => s.key === slug);
    if (hit) return hit;
  }
  if (overrides && overrides.length > 0) {
    const normT = norm(instanceTitle);
    for (const ov of overrides) {
      if (normT.startsWith(ov.titlePrefix.toLowerCase())) {
        const s = slots.find(s => s.key === ov.slotKey);
        if (s) return s;
      }
    }
  }
  return null;
}
function matchItem(slot: TplSlot, instanceText: string): TplItem | null {
  const slug = slugify(instanceText);
  return slug ? (slot.itemByKey.get(slug) ?? null) : null;
}
function matchActivity(item: TplItem, eventTitle: string): TplActivity | null {
  const slug = slugify(eventTitle);
  return slug ? (item.activityByKey.get(slug) ?? null) : null;
}

type Stats = { pitstops: number; pitstopsAlready: number; items: number; itemsAlready: number; activities: number; activitiesAlready: number; itemsUnmatched: number; activitiesUnmatched: number; pitstopsUnmatched: number };

async function runOne(prisma: PrismaClient, cfg: TemplateConfig): Promise<Stats> {
  const stats: Stats = { pitstops: 0, pitstopsAlready: 0, items: 0, itemsAlready: 0, activities: 0, activitiesAlready: 0, itemsUnmatched: 0, activitiesUnmatched: 0, pitstopsUnmatched: 0 };

  const tpl = await loadTemplate(prisma, cfg);
  if (!tpl) { console.error(`Template ${cfg.templateSlug} not found.`); return stats; }
  console.log(`\n══ ${tpl.name}  [${cfg.templateSlug}]  ${tpl.slots.length} slot(s) ══`);

  // Find candidate goals
  const excludes = (cfg.goalTitleExcludes ?? []).map(x => x.toLowerCase());
  const goals = await prisma.$queryRaw<{ goalId: string; goalTitle: string }[]>`
    SELECT DISTINCT g.id AS "goalId", g.title AS "goalTitle"
    FROM "Goal" g
    JOIN "Pitstop" p ON p."goalId" = g.id
    WHERE g."deletedAt" IS NULL
      AND p."deletedAt" IS NULL
      AND p."templateSlug" IS NULL
      AND LOWER(g.title) LIKE ${"%" + cfg.goalTitleIncludes.toLowerCase() + "%"}
    ORDER BY g.title
  `;
  // Apply exclude filter in JS for flexibility
  const candidateGoals = goals.filter(g => {
    const lt = g.goalTitle.toLowerCase();
    return !excludes.some(x => lt.includes(x));
  });

  if (candidateGoals.length === 0) {
    console.log(`  no candidate goals (filter: "${cfg.goalTitleIncludes}")`);
    return stats;
  }

  for (const g of candidateGoals) {
    console.log(`◆ ${g.goalTitle}`);

    const pitstops = await prisma.$queryRaw<{ id: string; title: string; templateSlug: string | null; templateKey: string | null }[]>`
      SELECT id, title, "templateSlug", "templateKey"
      FROM "Pitstop"
      WHERE "goalId" = ${g.goalId} AND "deletedAt" IS NULL
      ORDER BY "order"
    `;

    for (const p of pitstops) {
      const slot = matchSlot(tpl.slots, p.title, cfg.slotPrefixOverrides);
      if (!slot) {
        stats.pitstopsUnmatched += 1;
        continue;  // suppress unmatched logs for noise
      }
      if (p.templateSlug && p.templateKey) {
        stats.pitstopsAlready += 1;
      } else {
        console.log(`    ✓ "${p.title}" → ${slot.title}`);
        stats.pitstops += 1;
        if (APPLY) {
          await prisma.pitstop.update({
            where: { id: p.id },
            data: { templateSlug: cfg.templateSlug, templateKey: slot.key },
          });
        }
      }

      // Items
      const items = await prisma.$queryRaw<{ id: string; text: string; key: string | null; templateSlug: string | null }[]>`
        SELECT id, text, key, "templateSlug" FROM "ChecklistItem" WHERE "pitstopId" = ${p.id} ORDER BY "order"
      `;
      for (const it of items) {
        const tplItem = matchItem(slot, it.text);
        if (!tplItem) { stats.itemsUnmatched += 1; continue; }
        if (it.key && it.templateSlug) {
          stats.itemsAlready += 1;
        } else {
          stats.items += 1;
          if (APPLY) {
            await prisma.checklistItem.update({
              where: { id: it.id },
              data: { key: tplItem.key, templateSlug: cfg.templateSlug },
            });
          }
        }

        // Activities under this item
        const events = await prisma.$queryRaw<{ id: string; title: string; templateKey: string | null }[]>`
          SELECT id, title, "templateKey" FROM "PitstopEvent"
          WHERE "checklistItemId" = ${it.id} AND "deletedAt" IS NULL
        `;
        for (const ev of events) {
          const act = matchActivity(tplItem, ev.title);
          if (!act) { stats.activitiesUnmatched += 1; continue; }
          if (ev.templateKey) {
            stats.activitiesAlready += 1;
          } else {
            stats.activities += 1;
            if (APPLY) {
              await prisma.pitstopEvent.update({
                where: { id: ev.id },
                data: { templateKey: act.key },
              });
            }
          }
        }
      }
    }
  }

  return stats;
}

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  console.log(`${APPLY ? "APPLY MODE" : "DRY RUN"} — backfill template linkage`);
  if (ONLY_SLUG) console.log(`(filtered to --only ${ONLY_SLUG})`);

  const templates = ONLY_SLUG ? TEMPLATES.filter(t => t.templateSlug === ONLY_SLUG) : TEMPLATES;
  if (templates.length === 0) { console.error("no templates match --only filter"); await pool.end(); return; }

  const totals: Stats = { pitstops: 0, pitstopsAlready: 0, items: 0, itemsAlready: 0, activities: 0, activitiesAlready: 0, itemsUnmatched: 0, activitiesUnmatched: 0, pitstopsUnmatched: 0 };
  const perTemplate: Array<{ slug: string; stats: Stats }> = [];

  for (const cfg of templates) {
    const stats = await runOne(prisma, cfg);
    perTemplate.push({ slug: cfg.templateSlug, stats });
    for (const k of Object.keys(stats) as (keyof Stats)[]) totals[k] += stats[k];
  }

  console.log(`\n══ Summary by template ══`);
  for (const t of perTemplate) {
    console.log(`  ${t.slug.padEnd(45)}  pitstops:${t.stats.pitstops}/already:${t.stats.pitstopsAlready}  items:${t.stats.items}/already:${t.stats.itemsAlready}  activities:${t.stats.activities}/already:${t.stats.activitiesAlready}`);
  }
  console.log(`\nTotals:`);
  console.log(`  Pitstops:  ${totals.pitstops} link, ${totals.pitstopsAlready} already linked, ${totals.pitstopsUnmatched} no slot match`);
  console.log(`  Items:     ${totals.items} link, ${totals.itemsAlready} already linked, ${totals.itemsUnmatched} no template match`);
  console.log(`  Activities:${totals.activities} link, ${totals.activitiesAlready} already linked, ${totals.activitiesUnmatched} no template match`);
  if (!APPLY) console.log("\nDry run — pass --apply to write changes.");
  else        console.log("\nDone.");

  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
