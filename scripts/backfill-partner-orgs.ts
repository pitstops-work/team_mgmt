/**
 * One-shot backfill for the MapPartner → Org consolidation.
 *
 *   Phase A — Upsert one Org per MapPartner row (kind="partner",
 *             mapKey=MapPartner.key, slug=MapPartner.key).
 *   Phase B — For every Settlement with partnerId set, set partnerOrgId to
 *             the Org whose mapKey matches the MapPartner key.
 *   Phase C — For every LayerFeature with a `partner` free-text value, look
 *             up an Org via a curated normalisation map (see FREE_TEXT_TO_MAPKEY
 *             below); set partnerOrgId. Pre-creates Thanal + Diya Ghar Orgs
 *             since they appear in LayerFeature.partner but not in MapPartner.
 *   Phase D — Verification counts; exits nonzero on any mismatch.
 *
 * Idempotent. Safe to re-run. Supports --dry-run.
 *
 *   npx tsx scripts/backfill-partner-orgs.ts [--dry-run]
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

// LayerFeature.partner is free-text. From the diagnostic on 2026-06-04:
//   "CFAR Creches"      → cfar
//   "cfar"              → cfar
//   "Thanal Creches"    → thanal           (NEW Org, pre-created below)
//   "ActionAid"         → actionaid
//   "SIEDS"             → sieds
//   "maarga"            → maarga
//   "janasha"           → janasha
//   "Sangama"           → sangama
//   "Gubbachi"          → gubbachi
//   "Thamate"           → thamate
//   "Diya Ghar Creches" → diya-ghar        (NEW Org, pre-created below)
//   "sieds"             → sieds
//   "actionaid"         → actionaid
//   "gubbachi"          → gubbachi
// Add more rows here if `partner` strings change. Unknown values exit nonzero.
const FREE_TEXT_TO_MAPKEY: Record<string, string> = {
  "CFAR Creches": "cfar",
  "cfar": "cfar",
  "Thanal Creches": "thanal",
  "ActionAid": "actionaid",
  "actionaid": "actionaid",
  "SIEDS": "sieds",
  "sieds": "sieds",
  "maarga": "maarga",
  "Maarga": "maarga",
  "janasha": "janasha",
  "Janashayog": "janasha",
  "Sangama": "sangama",
  "sangama": "sangama",
  "Gubbachi": "gubbachi",
  "gubbachi": "gubbachi",
  "Thamate": "thamate",
  "thamate": "thamate",
  "Diya Ghar Creches": "diya-ghar",
};

// Orgs that aren't in MapPartner but appear in LayerFeature.partner.
// Pre-create them so phase C can resolve.
const EXTRA_ORGS: { name: string; slug: string; mapKey: string; color: string }[] = [
  { name: "Thanal",    slug: "thanal",    mapKey: "thanal",    color: "#94a3b8" },
  { name: "Diya Ghar", slug: "diya-ghar", mapKey: "diya-ghar", color: "#94a3b8" },
];

async function main() {
  const { default: prisma } = await import("../lib/prisma");

  console.log(DRY_RUN ? "DRY RUN — no writes will be performed" : "LIVE — writes will be performed");

  // ── Phase A — MapPartner → Org ────────────────────────────────────────────
  const mapPartners = await prisma.mapPartner.findMany({
    select: { id: true, key: true, label: true, color: true, contactName: true, contactPhone: true, notes: true },
    orderBy: { label: "asc" },
  });
  console.log(`\nPhase A: ${mapPartners.length} MapPartner rows → Org`);
  let createdA = 0, updatedA = 0;
  for (const m of mapPartners) {
    const slug = m.key;
    if (slug === "pitstops-internal") {
      console.warn(`  skip — MapPartner.key="${slug}" collides with the internal Org slug`);
      continue;
    }
    if (DRY_RUN) {
      const existing = await prisma.org.findUnique({ where: { slug } });
      if (existing) updatedA++; else createdA++;
      console.log(`  ${existing ? "update" : "create"}  ${m.label.padEnd(28)} slug=${slug}`);
      continue;
    }
    const res = await prisma.org.upsert({
      where: { slug },
      update: {
        name: m.label,
        kind: "partner",
        color: m.color,
        mapKey: m.key,
        contactName: m.contactName,
        contactPhone: m.contactPhone,
        notes: m.notes,
      },
      create: {
        name: m.label,
        slug,
        kind: "partner",
        color: m.color,
        mapKey: m.key,
        contactName: m.contactName,
        contactPhone: m.contactPhone,
        notes: m.notes,
      },
    });
    if (res.createdAt.getTime() > Date.now() - 5_000) createdA++; else updatedA++;
  }
  console.log(`  created: ${createdA}, updated: ${updatedA}`);

  // Pre-create extras for partners that appear only in LayerFeature.partner.
  console.log(`\nPhase A.1: ${EXTRA_ORGS.length} extra partner Orgs`);
  for (const e of EXTRA_ORGS) {
    if (DRY_RUN) {
      const existing = await prisma.org.findUnique({ where: { slug: e.slug } });
      console.log(`  ${existing ? "exists " : "create "} ${e.name.padEnd(20)} slug=${e.slug}`);
      continue;
    }
    await prisma.org.upsert({
      where: { slug: e.slug },
      update: { name: e.name, kind: "partner", color: e.color, mapKey: e.mapKey },
      create: { name: e.name, slug: e.slug, kind: "partner", color: e.color, mapKey: e.mapKey },
    });
    console.log(`  upserted ${e.name}`);
  }

  // Build mapKey → orgId index for the geo backfills.
  const partnerOrgs = await prisma.org.findMany({
    where: { kind: "partner" },
    select: { id: true, slug: true, mapKey: true, name: true },
  });
  const orgByMapKey = new Map<string, string>();
  for (const o of partnerOrgs) if (o.mapKey) orgByMapKey.set(o.mapKey, o.id);
  console.log(`\nResolved ${orgByMapKey.size} partner Org rows by mapKey.`);

  // ── Phase B — Settlement.partnerId → Settlement.partnerOrgId ─────────────
  // Skip rows that already have partnerOrgId (idempotent).
  console.log(`\nPhase B: Settlement.partnerId → Settlement.partnerOrgId`);
  const settlementCandidates = await prisma.settlement.findMany({
    where: { partnerId: { not: null }, partnerOrgId: null },
    select: { id: true, name: true, partnerId: true, partner: { select: { key: true, label: true } } },
  });
  console.log(`  ${settlementCandidates.length} settlements need backfill`);
  let updatedB = 0, skippedB = 0;
  for (const s of settlementCandidates) {
    const key = s.partner?.key;
    const orgId = key ? orgByMapKey.get(key) : null;
    if (!orgId) {
      console.warn(`  skip — "${s.name}" partner.key="${key}" had no matching Org`);
      skippedB++;
      continue;
    }
    if (!DRY_RUN) {
      await prisma.settlement.update({ where: { id: s.id }, data: { partnerOrgId: orgId } });
    }
    updatedB++;
  }
  console.log(`  updated: ${updatedB}, skipped: ${skippedB}`);

  // ── Phase C — LayerFeature.partner (free-text) → partnerOrgId ─────────────
  console.log(`\nPhase C: LayerFeature.partner (free-text) → partnerOrgId`);
  const lfCandidates = await prisma.layerFeature.findMany({
    where: { partner: { not: null }, partnerOrgId: null },
    select: { id: true, name: true, partner: true },
  });
  console.log(`  ${lfCandidates.length} LayerFeature rows need backfill`);
  let updatedC = 0, skippedC = 0;
  const unmatched = new Map<string, number>();
  for (const f of lfCandidates) {
    const raw = f.partner ?? "";
    const mapKey = FREE_TEXT_TO_MAPKEY[raw];
    if (!mapKey) {
      unmatched.set(raw, (unmatched.get(raw) ?? 0) + 1);
      skippedC++;
      continue;
    }
    const orgId = orgByMapKey.get(mapKey);
    if (!orgId) {
      console.warn(`  skip — mapKey="${mapKey}" resolved no Org (extras seeded above?)`);
      skippedC++;
      continue;
    }
    if (!DRY_RUN) {
      await prisma.layerFeature.update({ where: { id: f.id }, data: { partnerOrgId: orgId } });
    }
    updatedC++;
  }
  console.log(`  updated: ${updatedC}, skipped: ${skippedC}`);
  if (unmatched.size > 0) {
    console.error(`\nUNMATCHED free-text partner values (add to FREE_TEXT_TO_MAPKEY):`);
    for (const [v, n] of unmatched) console.error(`  "${v}"  ×${n}`);
    process.exitCode = 2;
  }

  // ── Phase D — Verification counts ─────────────────────────────────────────
  console.log(`\nPhase D: verification`);
  const partnerOrgCount = await prisma.org.count({ where: { kind: "partner" } });
  const mapPartnerCount = mapPartners.length;
  console.log(`  MapPartner rows : ${mapPartnerCount}`);
  console.log(`  partner Org rows: ${partnerOrgCount}   (expected ≥ ${mapPartnerCount + EXTRA_ORGS.length})`);

  const sLegacy = await prisma.settlement.count({ where: { partnerId: { not: null } } });
  const sNew    = await prisma.settlement.count({ where: { partnerOrgId: { not: null } } });
  console.log(`  Settlement.partnerId set    : ${sLegacy}`);
  console.log(`  Settlement.partnerOrgId set : ${sNew}     ${sNew === sLegacy ? "OK" : "MISMATCH"}`);

  const lfLegacy = await prisma.layerFeature.count({ where: { partner: { not: null } } });
  const lfNew    = await prisma.layerFeature.count({ where: { partnerOrgId: { not: null } } });
  console.log(`  LayerFeature.partner set    : ${lfLegacy}`);
  console.log(`  LayerFeature.partnerOrgId set: ${lfNew}     ${lfNew === lfLegacy ? "OK" : "MISMATCH"}`);

  if (sNew !== sLegacy || lfNew !== lfLegacy) {
    console.error(`\nVerification FAILED — counts differ. Re-run --dry-run to inspect.`);
    process.exitCode = 3;
  } else {
    console.log(`\nAll counts match. Backfill complete.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
