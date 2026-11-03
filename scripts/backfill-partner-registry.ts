/**
 * Resolve the review portal's free-text organisations onto the partner registry.
 *
 * The 20261103120000_partner_registry_on_org migration handles the main DB:
 * every GrantPartner gains an orgId, the four grantees with no Org row get one,
 * and each partner name becomes an alias of itself. This script does the review
 * DB, which has no migration runner of its own:
 *
 *   1. `orgs`        — link each row to a registry partner via app_org_id.
 *   2. `grant_notes` — resolve org_name (free text, 33 notes, seven spellings
 *                      of one grantee) to app_org_id.
 *
 * Read-only by default, and strictly so: a dry run issues no DDL and no writes
 * of any kind, not even the ADD COLUMN IF NOT EXISTS the apply path needs. It
 * checks information_schema instead and reports the columns as missing.
 *
 * Unresolved names are reported, never guessed. A spelling that is the
 * canonical name plus extra words ("Gubbachi Foundation", "Gubbachi NGO") is
 * *proposed* as an alias and recorded only with --apply-aliases; a typo
 * ("Gubabchi") or an organisation that simply isn't in the registry ("CDD",
 * "Sampark") needs a human decision:
 *
 *   npx tsx scripts/backfill-partner-registry.ts                      # dry run
 *   npx tsx scripts/backfill-partner-registry.ts --apply              # safe links only
 *   npx tsx scripts/backfill-partner-registry.ts --apply --apply-aliases
 *   npx tsx scripts/backfill-partner-registry.ts --apply --alias "Gubabchi=Gubbachi"
 *
 * NOTE: .env.local points at production. Every --apply run is a production
 * write. The dry run is the default for that reason.
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

type NoteRow = { id: string; org_name: string; org_city: string | null; app_org_id: string | null };
type OrgRow = { id: string; name: string; city: string | null; app_org_id: string | null };

function parseAliasFlags(argv: string[]): { alias: string; target: string }[] {
  const out: { alias: string; target: string }[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--alias") continue;
    const pair = argv[i + 1] ?? "";
    const eq = pair.lastIndexOf("=");
    if (eq < 1) throw new Error(`--alias needs "spelling=Canonical Name", got "${pair}"`);
    out.push({ alias: pair.slice(0, eq).trim(), target: pair.slice(eq + 1).trim() });
  }
  return out;
}

async function main() {
  // Imported inside main: a top-level import is hoisted above dotenv.config(),
  // so the Prisma client would be constructed before DATABASE_URL exists.
  const { default: prisma } = await import("../lib/prisma");
  const { neon } = await import("@neondatabase/serverless");
  const { normalizePartnerName, resolvePartnerByName, recordPartnerAlias, listPartners } = await import(
    "../lib/partners/registry"
  );

  const apply = process.argv.includes("--apply");
  const applyAliases = process.argv.includes("--apply-aliases");
  const explicitAliases = parseAliasFlags(process.argv);
  const sql = neon(process.env.REVIEW_DATABASE_URL!);

  console.log(apply ? "APPLY — writing to production\n" : "DRY RUN — nothing is written\n");

  // ── 0. Explicit aliases first, so the passes below can resolve through them ──
  for (const { alias, target } of explicitAliases) {
    const match = await resolvePartnerByName(target);
    if (!match) {
      console.log(`  alias SKIP  "${alias}" → "${target}" (no such partner in the registry)`);
      continue;
    }
    if (apply) {
      const r = await recordPartnerAlias(match.partner.id, alias, "backfill --alias");
      console.log(
        r.ok
          ? `  alias OK    "${alias}" → ${match.partner.name}`
          : `  alias CLASH "${alias}" already resolves elsewhere (org ${r.conflictOrgId})`,
      );
    } else {
      console.log(`  alias WOULD "${alias}" → ${match.partner.name}`);
    }
  }

  // ── 1. Soft-FK columns ──
  // A dry run must not touch the schema, so it asks whether the columns are
  // there rather than ensuring they are.
  const hasColumn = async (table: string, column: string): Promise<boolean> => {
    const rows = (await sql`
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
       LIMIT 1
    `) as unknown[];
    return rows.length > 0;
  };

  if (apply) {
    const { ensurePartnerColumns } = await import("../lib/partners/reviewMirror");
    await ensurePartnerColumns();
  } else {
    const missing: string[] = [];
    if (!(await hasColumn("orgs", "app_org_id"))) missing.push("orgs.app_org_id");
    if (!(await hasColumn("grant_notes", "app_org_id"))) missing.push("grant_notes.app_org_id");
    if (missing.length) {
      console.log(`  columns not present yet: ${missing.join(", ")}`);
      console.log("  (--apply adds them; this run reads every row as unlinked)\n");
    }
  }

  const orgsLinkable = apply || (await hasColumn("orgs", "app_org_id"));
  const notesLinkable = apply || (await hasColumn("grant_notes", "app_org_id"));

  // The main DB has to be migrated first — this script resolves *onto* the
  // registry and has nothing to resolve onto until GrantPartner.orgId exists.
  // Checked explicitly so the failure reads as "deploy first", not as a Prisma
  // column-not-found stack trace.
  const migrated = (await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM information_schema.columns
     WHERE table_name = 'GrantPartner' AND column_name = 'orgId'
  `)[0];
  if (Number(migrated?.n ?? 0) === 0) {
    throw new Error(
      "GrantPartner.orgId is missing: migration 20261103120000_partner_registry_on_org " +
        "has not been applied to this database yet. Deploy (or run prisma migrate deploy) first.",
    );
  }

  const partners = await listPartners();
  console.log(`registry: ${partners.length} partners\n`);

  // ── 2. review.orgs → registry ──
  const orgs = (
    orgsLinkable
      ? await sql`SELECT id, name, city, app_org_id FROM orgs ORDER BY name`
      : await sql`SELECT id, name, city, NULL::text AS app_org_id FROM orgs ORDER BY name`
  ) as OrgRow[];

  console.log(`── orgs (${orgs.length}) ──`);
  for (const o of orgs) {
    if (o.app_org_id) {
      console.log(`  linked      ${o.name}`);
      continue;
    }
    const match = await resolvePartnerByName(o.name);
    if (!match) {
      console.log(`  UNRESOLVED  ${o.name}${o.city ? ` (${o.city})` : ""} — not a registry partner`);
      continue;
    }
    if (apply) {
      await sql`UPDATE orgs SET app_org_id = ${match.partner.id}, updated_at = now() WHERE id = ${o.id}`;
      await sql`INSERT INTO org_due_diligence (org_id) VALUES (${o.id}) ON CONFLICT (org_id) DO NOTHING`;
      console.log(`  linked      ${o.name} → ${match.partner.name} (via ${match.matchedVia})`);
    } else {
      console.log(`  would link  ${o.name} → ${match.partner.name} (via ${match.matchedVia})`);
    }
  }

  // ── 3. grant_notes.org_name → registry ──
  const notes = (
    notesLinkable
      ? await sql`SELECT id, org_name, org_city, app_org_id FROM grant_notes ORDER BY org_name`
      : await sql`SELECT id, org_name, org_city, NULL::text AS app_org_id FROM grant_notes ORDER BY org_name`
  ) as NoteRow[];

  // One decision per distinct spelling, applied to every note that uses it.
  const byName = new Map<string, NoteRow[]>();
  for (const n of notes) {
    if (n.app_org_id) continue;
    const key = (n.org_name ?? "").trim();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(n);
  }

  console.log(`\n── grant_notes (${notes.length} notes, ${byName.size} distinct unlinked spellings) ──`);
  const unresolved: {
    name: string;
    count: number;
    candidates: string[];
    /** consortium rows need a different instruction from unknown ones. */
    kind: "unknown" | "consortium";
  }[] = [];
  let linkedNotes = 0;

  for (const [name, rows] of [...byName.entries()].sort()) {
    if (!name || name === "(unnamed)") {
      console.log(`  SKIP        "${name || "(blank)"}" × ${rows.length} — no organisation named`);
      continue;
    }

    let match = await resolvePartnerByName(name);

    // Propose: the spelling is a registry name plus extra words. Prefix
    // containment only, and only in that direction — "Gubbachi Foundation"
    // starts with "Gubbachi", so it is almost certainly the same org with a
    // suffix. Never the reverse, and never a typo ("Gubabchi" gets no
    // proposal and waits for a human).
    if (!match) {
      const key = normalizePartnerName(name);
      const candidates = partners.filter((p) => {
        const pk = normalizePartnerName(p.name);
        return pk.length >= 4 && key.startsWith(pk);
      });

      // A note naming several partners is not a note about the first one.
      // "CFAR, ActionAid, Maarga, Janasahayog, SEIDS" is a five-org
      // consortium: it prefix-matches CFAR, and aliasing it to CFAR would
      // quietly re-attribute a joint grant to one member. Any spelling that
      // mentions more than one registry partner goes to a human instead.
      const mentioned = partners.filter((p) => {
        const pk = normalizePartnerName(p.name);
        return pk.length >= 4 && key.includes(pk);
      });
      if (mentioned.length > 1) {
        unresolved.push({
          name,
          count: rows.length,
          candidates: mentioned.map((m) => m.name),
          kind: "consortium",
        });
        continue;
      }

      if (candidates.length === 1 && applyAliases) {
        const target = candidates[0];
        if (apply) {
          const r = await recordPartnerAlias(target.id, name, "grant_notes.org_name");
          if (!r.ok) {
            console.log(`  CLASH       "${name}" already resolves elsewhere (org ${r.conflictOrgId})`);
            continue;
          }
        }
        console.log(`  ${apply ? "alias +    " : "would alias"} "${name}" → ${target.name}`);
        match = { partner: target, matchedVia: "alias" as const };
      } else {
        unresolved.push({
          name,
          count: rows.length,
          candidates: candidates.map((c) => c.name),
          kind: "unknown",
        });
        continue;
      }
    }

    if (apply) {
      for (const r of rows) {
        await sql`UPDATE grant_notes SET app_org_id = ${match.partner.id} WHERE id = ${r.id}`;
      }
      console.log(`  linked      "${name}" × ${rows.length} → ${match.partner.name}`);
    } else {
      console.log(`  would link  "${name}" × ${rows.length} → ${match.partner.name} (via ${match.matchedVia})`);
    }
    linkedNotes += rows.length;
  }

  if (unresolved.length) {
    console.log(`\n── needs a human (${unresolved.length} spellings) ──`);
    for (const u of unresolved) {
      // A consortium row must never be offered an alias: the whole point is
      // that no single partner owns the note. Say what it names and leave it.
      const hint =
        u.kind === "consortium"
          ? `  — names ${u.candidates.join(", ")}; a note cannot belong to several partners. ` +
            `Leave it unlinked, or split it per partner.`
          : u.candidates.length
            ? `  — looks like: ${u.candidates.join(", ")} (re-run with --apply-aliases, or --alias "${u.name}=${u.candidates[0]}")`
            : `  — no registry partner resembles this. If it is a misspelling or an old name, ` +
              `--alias "${u.name}=<partner>"; if it is a partner we simply don't have, ` +
              `add it in Settings → Partners first.`;
      console.log(`  "${u.name}" × ${u.count}${hint}`);
    }
  }

  console.log(
    `\n${apply ? "linked" : "would link"}: ${linkedNotes}/${notes.length} notes; ` +
      `${unresolved.length} spellings left for a human.`,
  );
  await prisma.$disconnect();
}

// No .finally(process.exit(0)) — that swallows a failure and reports it as a
// clean run, which is how a silent no-op gets mistaken for success.
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
