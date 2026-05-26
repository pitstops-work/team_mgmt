/**
 * Backfill `templateSlug` + `templateKey` linkage on Pitstop / ChecklistItem /
 * PitstopEvent rows so the template-sync engine can recognise instances created
 * before linkage was stamped (or via paths that skipped it).
 *
 * Currently hard-wired to one template + one goal-title filter so the matching
 * stays narrow. To run for a different template, edit the CONFIG block.
 *
 * Matching rules:
 *   - Goal must match a substring (so we don't accidentally link sibling-template
 *     pitstops with overlapping names — e.g. YRC's "Monthly Training").
 *   - Pitstop linked when its normalized title starts with the slot's titlePrefix.
 *   - ChecklistItem linked when its normalized text equals a slot item's text.
 *   - Activity (PitstopEvent) linked when its normalized title equals a slot
 *     item's activity title.
 *   - Already-linked rows are left alone (idempotent).
 *
 * Usage:
 *   npx tsx scripts/backfill-template-linkage.ts          # dry run
 *   npx tsx scripts/backfill-template-linkage.ts --apply  # write
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");

const CONFIG = {
  templateSlug: "children-learning-centre-existing",
  goalTitleIncludes: "children learning centre (existing)", // case-insensitive substring filter
  // Pitstop slots: titlePrefix is matched as a normalized prefix on the instance title.
  // (Slot's actual key/items/activities are loaded from the template DB row.)
  slotPrefixes: [
    { templateSlotTitle: "Centre Visits — Weekly",          titlePrefix: "centre visits" },
    { templateSlotTitle: "Monthly Training",                titlePrefix: "monthly training" },
    { templateSlotTitle: "Govt School & DI Coordination",   titlePrefix: "govt school" },
  ],
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")    // em/en dashes → hyphen
    .replace(/[‘’]/g, "'")    // curly quotes → straight
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Mirror lib/templateDb.ts → slugifyChecklistText so we can match an instance's
// item text against the template item's `key` (which was derived from the
// item's ORIGINAL text, surviving subsequent renames).
function slugifyChecklistText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type TplSlotItem = { key: string; activityByTitle: Map<string, string>; activityByKey: Map<string, string> };
type TplSlot = {
  key: string;
  title: string;
  titlePrefix: string;
  itemByText: Map<string, TplSlotItem>;   // current normalized template text → item
  itemByKey:  Map<string, TplSlotItem>;   // template key → item (for slugified-text fallback)
};

async function main() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool as never);
  const prisma = new PrismaClient({ adapter } as never);

  console.log(`${APPLY ? "APPLY MODE" : "DRY RUN"} — backfill ${CONFIG.templateSlug}\n`);

  // ── Load template structure ────────────────────────────────────────────
  const tpl = await prisma.goalTemplateDef.findUnique({
    where: { slug: CONFIG.templateSlug },
    select: { name: true, slug: true, pitstops: true },
  });
  if (!tpl) { console.error(`Template ${CONFIG.templateSlug} not found.`); await pool.end(); return; }

  type RawSlot = {
    key?: string; title: string;
    checklist?: Array<{
      key?: string; text: string;
      activities?: Array<{ key?: string; title: string }>;
      activityKey?: string; activityTitle?: string;
    }>;
  };
  const rawSlots = (tpl.pitstops as unknown as RawSlot[]) ?? [];

  const slots: TplSlot[] = [];
  for (const cfg of CONFIG.slotPrefixes) {
    const raw = rawSlots.find(s => s.title === cfg.templateSlotTitle);
    if (!raw) { console.error(`Slot "${cfg.templateSlotTitle}" not in template — fix CONFIG.`); await pool.end(); return; }
    const itemByText = new Map<string, TplSlotItem>();
    const itemByKey  = new Map<string, TplSlotItem>();
    for (const item of raw.checklist ?? []) {
      if (!item.key) { console.warn(`  ⚠ Item "${item.text}" has no explicit key — skipping`); continue; }
      const activityByTitle = new Map<string, string>();
      const activityByKey   = new Map<string, string>();
      const acts = item.activities ?? (item.activityTitle ? [{ key: item.activityKey, title: item.activityTitle }] : []);
      for (const a of acts) {
        if (!a.key || !a.title) continue;
        activityByTitle.set(norm(a.title), a.key);
        activityByKey.set(a.key, a.key);
      }
      const entry: TplSlotItem = { key: item.key, activityByTitle, activityByKey };
      itemByText.set(norm(item.text), entry);
      itemByKey.set(item.key, entry);
    }
    if (!raw.key) { console.error(`Slot "${raw.title}" has no key`); await pool.end(); return; }
    slots.push({ key: raw.key, title: raw.title, titlePrefix: cfg.titlePrefix.toLowerCase(), itemByText, itemByKey });
  }

  console.log(`Template loaded — ${slots.length} pitstop slots:`);
  for (const s of slots) {
    console.log(`  "${s.title}"  key=${s.key}  ${s.itemByText.size} items`);
  }

  // ── Scan candidate instances ──────────────────────────────────────────
  const candidatePitstops = await prisma.$queryRaw<{
    pitstopId: string; pitstopTitle: string; pitstopSlug: string | null; pitstopKey: string | null;
    goalId: string; goalTitle: string;
  }[]>`
    SELECT p.id AS "pitstopId", p.title AS "pitstopTitle",
           p."templateSlug" AS "pitstopSlug", p."templateKey" AS "pitstopKey",
           g.id AS "goalId", g.title AS "goalTitle"
    FROM "Pitstop" p
    JOIN "Goal" g ON g.id = p."goalId"
    WHERE p."deletedAt" IS NULL
      AND g."deletedAt" IS NULL
      AND g.title ILIKE ${"%" + CONFIG.goalTitleIncludes + "%"}
    ORDER BY g.title, p."order"
  `;

  console.log(`\n${candidatePitstops.length} pitstops in matching goals (filter: title ILIKE '%${CONFIG.goalTitleIncludes}%')\n`);

  let pitstopsLinked = 0, pitstopsAlready = 0, pitstopsUnmatched = 0;
  let itemsLinked = 0, itemsAlready = 0, itemsUnmatched = 0;
  let activitiesLinked = 0, activitiesAlready = 0, activitiesUnmatched = 0;

  const byGoal = new Map<string, { title: string; ps: typeof candidatePitstops }>();
  for (const r of candidatePitstops) {
    const g = byGoal.get(r.goalId) ?? { title: r.goalTitle, ps: [] };
    g.ps.push(r); byGoal.set(r.goalId, g);
  }

  for (const [, g] of byGoal) {
    console.log(`◆ ${g.title}`);
    for (const p of g.ps) {
      const normTitle = norm(p.pitstopTitle);
      const slot = slots.find(s => normTitle.startsWith(s.titlePrefix));

      if (!slot) {
        console.log(`    ✗ "${p.pitstopTitle}" — no slot prefix match`);
        pitstopsUnmatched += 1;
        continue;
      }

      if (p.pitstopSlug && p.pitstopKey) {
        console.log(`    ↺ "${p.pitstopTitle}" → already linked (slug=${p.pitstopSlug} key=${p.pitstopKey})`);
        pitstopsAlready += 1;
      } else {
        console.log(`    ✓ "${p.pitstopTitle}" → ${slot.title}  [will link slug=${CONFIG.templateSlug} key=${slot.key}]`);
        pitstopsLinked += 1;
        if (APPLY) {
          await prisma.pitstop.update({
            where: { id: p.pitstopId },
            data: { templateSlug: CONFIG.templateSlug, templateKey: slot.key },
          });
        }
      }

      // ── Items ───────────────────────────────────────────────────────
      const items = await prisma.$queryRaw<{
        id: string; text: string; key: string | null; templateSlug: string | null;
      }[]>`
        SELECT id, text, key, "templateSlug"
        FROM "ChecklistItem"
        WHERE "pitstopId" = ${p.pitstopId}
        ORDER BY "order"
      `;
      for (const it of items) {
        // Primary: match by current template text. Fallback: match by slugifying
        // the instance text and checking the template's keys — catches items the
        // admin already renamed (template key survives the rename).
        let tplItem = slot.itemByText.get(norm(it.text));
        let matchedVia: "text" | "key" | null = tplItem ? "text" : null;
        if (!tplItem) {
          const slug = slugifyChecklistText(it.text);
          if (slug) {
            const byKey = slot.itemByKey.get(slug);
            if (byKey) { tplItem = byKey; matchedVia = "key"; }
          }
        }
        if (!tplItem) {
          console.log(`        ✗ item "${it.text}" — no template match`);
          itemsUnmatched += 1;
          continue;
        }
        const via = matchedVia === "key" ? "  (matched via key fallback — text was renamed in template)" : "";
        if (it.key && it.templateSlug) {
          itemsAlready += 1;
          // suppress noisy line for already-linked items
        } else {
          console.log(`        ✓ item "${it.text}" → key=${tplItem.key}${via}`);
          itemsLinked += 1;
          if (APPLY) {
            await prisma.checklistItem.update({
              where: { id: it.id },
              data: { key: tplItem.key, templateSlug: CONFIG.templateSlug },
            });
          }
        }

        // ── Activities (PitstopEvent) under this item ────────────────
        const events = await prisma.$queryRaw<{
          id: string; title: string; templateKey: string | null;
        }[]>`
          SELECT id, title, "templateKey"
          FROM "PitstopEvent"
          WHERE "checklistItemId" = ${it.id} AND "deletedAt" IS NULL
        `;
        for (const ev of events) {
          let actKey = tplItem.activityByTitle.get(norm(ev.title));
          let actVia: "title" | "key" | null = actKey ? "title" : null;
          if (!actKey) {
            const slug = slugifyChecklistText(ev.title);
            if (slug && tplItem.activityByKey.has(slug)) { actKey = slug; actVia = "key"; }
          }
          if (!actKey) {
            console.log(`            ✗ activity "${ev.title}" — no template match`);
            activitiesUnmatched += 1;
            continue;
          }
          const actViaMsg = actVia === "key" ? "  (matched via key fallback)" : "";
          if (ev.templateKey) {
            activitiesAlready += 1;
          } else {
            console.log(`            ✓ activity "${ev.title}" → key=${actKey}${actViaMsg}`);
            activitiesLinked += 1;
            if (APPLY) {
              await prisma.pitstopEvent.update({
                where: { id: ev.id },
                data: { templateKey: actKey },
              });
            }
          }
        }
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Pitstops:  ${pitstopsLinked} link, ${pitstopsAlready} already linked, ${pitstopsUnmatched} no slot match`);
  console.log(`  Items:     ${itemsLinked} link, ${itemsAlready} already linked, ${itemsUnmatched} no template match`);
  console.log(`  Activities:${activitiesLinked} link, ${activitiesAlready} already linked, ${activitiesUnmatched} no template match`);
  if (!APPLY) console.log("\nDry run — pass --apply to write changes.");
  else        console.log("\nDone.");

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
