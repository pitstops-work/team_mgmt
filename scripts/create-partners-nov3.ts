/**
 * One-off: the four partners the review portal's grant notes referred to but
 * the registry never had, plus the two aliases that resolve the spellings
 * around them.
 *
 * Each one was identified from the note that names it, not from the name alone
 * (see the triage in the session that added this):
 *
 *   Sampark       — "Food Distribution Programme — Bangalore / Implementation
 *                    Partner: Sampark, Bangalore", ₹74.64L, submitted. Also the
 *                    only budget in the system whose grantee is identifiable
 *                    from its own name ("Sampark", Others/draft) and has none.
 *   CDD           — Water and Sanitation, ₹10L, Bangalore, 22 Jun. Two
 *                    spellings, one org; the long form in the note misspells
 *                    "Consortium" as "Consoritum", so both are aliased and the
 *                    canonical name is the initialism.
 *   Daya Rehabilitation Trust  — grant note, ₹75L, 1 yr.
 *   Kadam Education Trust      — full approval note, Ahmedabad, Adolescent
 *                    Girls, ₹53.16L, 3 yrs. Outside Bangalore/Chennai: the Org
 *                    identity is geography-free, so this creates the partner
 *                    only. Any grant relationship for it belongs under the
 *                    "Others" granting unit, and is not created here.
 *   Gubabchi      — a misspelling of Gubbachi, aliased rather than created.
 *
 * Deliberately NOT created: "Seeding Programme" (APF's own programme, not a
 * grantee — see the /seeding portal) and the three consortium notes, which
 * name five partners between them and so have no single owner.
 *
 * Idempotent: createPartner resolves on the normalised name and recordPartnerAlias
 * refuses to re-point a spelling that already means something else. Re-running
 * is a no-op.
 *
 * NOTE: .env.local is production. Requires --apply to write.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const PARTNERS = [
  { name: "Sampark", notes: "Food Distribution Programme, Bangalore — implementation partner" },
  { name: "CDD", notes: "Consortium for DEWATS Dissemination — water and sanitation" },
  { name: "Daya Rehabilitation Trust", notes: null },
  { name: "Kadam Education Trust", notes: "Ahmedabad, Gujarat — adolescent girls" },
];

const ALIASES = [
  { alias: "Gubabchi", target: "Gubbachi", why: "misspelling in grant_notes.org_name" },
  {
    alias: "CDD (Consoritum for DEWATS Dissemination)",
    target: "CDD",
    why: "long form, with the note's 'Consoritum' typo preserved as found",
  },
];

async function main() {
  const { default: prisma } = await import("../lib/prisma");
  const { createPartner, recordPartnerAlias, resolvePartnerByName } = await import(
    "../lib/partners/registry"
  );

  const apply = process.argv.includes("--apply");
  console.log(apply ? "APPLY — writing to production\n" : "DRY RUN — nothing is written\n");

  for (const p of PARTNERS) {
    const existing = await resolvePartnerByName(p.name);
    if (existing) {
      console.log(`  exists    ${p.name} → ${existing.partner.name} (via ${existing.matchedVia})`);
      continue;
    }
    if (!apply) {
      console.log(`  would add ${p.name}`);
      continue;
    }
    const created = await createPartner({ name: p.name, notes: p.notes });
    console.log(`  created   ${created.name} (${created.id})`);
  }

  console.log("");
  for (const a of ALIASES) {
    const target = await resolvePartnerByName(a.target);
    if (!target) {
      console.log(`  SKIP      "${a.alias}" → "${a.target}" does not exist yet`);
      continue;
    }
    if (!apply) {
      console.log(`  would map "${a.alias}" → ${target.partner.name}`);
      continue;
    }
    const r = await recordPartnerAlias(target.partner.id, a.alias, a.why);
    console.log(
      r.ok
        ? `  mapped    "${a.alias}" → ${target.partner.name}`
        : `  CLASH     "${a.alias}" already resolves elsewhere (org ${r.conflictOrgId})`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
