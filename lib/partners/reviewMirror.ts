/**
 * The review portal's view of the partner registry.
 *
 * The review portal (due diligence, approvals, grant notes) lives in its own
 * database — REVIEW_DATABASE_URL, reached over raw SQL — so it cannot hold a
 * foreign key to `Org` in the main one. It used to cope by minting partners of
 * its own: `orgs.name` is a UNIQUE text column someone typed into, and
 * `grant_notes.org_name` is free text with no table behind it at all. The
 * result was four real partners in `orgs` (three of them "Demo", "Test" and
 * "dmnfbjdkbs") and 33 grant notes spread over seven spellings of one grantee.
 *
 * So the review DB keeps a *mirror* row per partner, carrying `app_org_id` —
 * a soft FK to Org.id. The mirror exists only so the review DB's own joins
 * (org_due_diligence, assessment_assemblies) keep working against a local uuid;
 * the main DB stays authoritative for name, city and contacts, and the mirror
 * is refreshed from it on every resolve. Same cross-DB shape as
 * lib/review/budget-bridge.ts, which reads budgets the other way.
 *
 * Nothing in the review portal may INSERT into `orgs` any more except through
 * `ensureReviewOrg`.
 */

import { sql } from "@/lib/review/db";
import { getPartner, type PartnerRecord } from "./registry";

/**
 * Add the soft-FK columns. Cheap and idempotent, matching the
 * `ensureTables()` convention the review routes already use — this DB has no
 * migration runner of its own.
 */
export async function ensurePartnerColumns(): Promise<void> {
  await sql`ALTER TABLE orgs ADD COLUMN IF NOT EXISTS app_org_id text`;
  // Partial unique: one mirror row per registry partner, while the legacy rows
  // that have no app_org_id yet (and the junk ones) don't collide on NULL.
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS orgs_app_org_id_key ON orgs (app_org_id) WHERE app_org_id IS NOT NULL`;
  await sql`ALTER TABLE grant_notes ADD COLUMN IF NOT EXISTS app_org_id text`;
  await sql`CREATE INDEX IF NOT EXISTS grant_notes_app_org_id_idx ON grant_notes (app_org_id)`;
}

export type ReviewOrgRow = { id: string; name: string; city: string; app_org_id: string | null };

/**
 * The review-DB mirror row for a registry partner, created or refreshed.
 *
 * Returns the local uuid, which is what `org_due_diligence.org_id` and
 * `assessment_assemblies.org_id` reference. Matches an existing row by
 * `app_org_id` first, then adopts a legacy row whose name happens to match —
 * so the one real partner already in the review DB (Thamate) is claimed rather
 * than duplicated.
 */
export async function ensureReviewOrg(orgId: string): Promise<ReviewOrgRow> {
  const partner = await getPartner(orgId);
  if (!partner) throw new Error("Unknown partner");
  await ensurePartnerColumns();

  const city = partner.grants[0]?.city ?? "";

  const linked = (await sql`
    SELECT id, name, city, app_org_id FROM orgs WHERE app_org_id = ${partner.id} LIMIT 1
  `) as ReviewOrgRow[];
  if (linked.length) {
    const row = linked[0];
    if (row.name !== partner.name) {
      await sql`UPDATE orgs SET name = ${partner.name}, updated_at = now() WHERE id = ${row.id}`;
    }
    return { ...row, name: partner.name };
  }

  // Adopt a legacy row typed with this partner's name before the registry.
  const adopted = (await sql`
    UPDATE orgs SET app_org_id = ${partner.id}, updated_at = now()
     WHERE app_org_id IS NULL
       AND regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(${partner.name}), '[^a-z0-9]', '', 'g')
    RETURNING id, name, city, app_org_id
  `) as ReviewOrgRow[];
  if (adopted.length) return adopted[0];

  const created = (await sql`
    INSERT INTO orgs (name, city, app_org_id)
    VALUES (${partner.name}, ${city}, ${partner.id})
    ON CONFLICT (name) DO UPDATE SET app_org_id = EXCLUDED.app_org_id, updated_at = now()
    RETURNING id, name, city, app_org_id
  `) as ReviewOrgRow[];

  await sql`
    INSERT INTO org_due_diligence (org_id) VALUES (${created[0].id})
    ON CONFLICT (org_id) DO NOTHING
  `;
  return created[0];
}

/**
 * The registry partner behind a review-DB org row, or null for a legacy row
 * that was typed in before the registry and has never been resolved.
 */
export async function partnerForReviewOrg(reviewOrgId: string): Promise<PartnerRecord | null> {
  await ensurePartnerColumns();
  const rows = (await sql`SELECT app_org_id FROM orgs WHERE id = ${reviewOrgId} LIMIT 1`) as {
    app_org_id: string | null;
  }[];
  const appOrgId = rows[0]?.app_org_id;
  return appOrgId ? getPartner(appOrgId) : null;
}
