// Capability registry — phase 2.
// Loaded from the capabilities table on REVIEW_DATABASE_URL.

import { sql } from './db';

export type CapabilityCategory =
  | 'language' | 'financial' | 'structure' | 'format' | 'cost' | 'compliance' | 'custom';

export type Capability = {
  id: string;
  label: string;
  category: CapabilityCategory;
  description: string;
  prompt_fragment: string;
  config_json: Record<string, unknown>;
  built_in: boolean;
  archived_at: Date | null;
  updated_at: Date;
};

function rowToCapability(r: any): Capability {
  return {
    id: r.id,
    label: r.label,
    category: r.category,
    description: r.description,
    prompt_fragment: r.prompt_fragment,
    config_json: r.config_json || {},
    built_in: r.built_in,
    archived_at: r.archived_at ? new Date(r.archived_at) : null,
    updated_at: new Date(r.updated_at),
  };
}

export async function getCapabilities(opts: { includeArchived?: boolean } = {}): Promise<Capability[]> {
  const rows = opts.includeArchived
    ? await sql`SELECT * FROM capabilities ORDER BY built_in DESC, category, id`
    : await sql`SELECT * FROM capabilities WHERE archived_at IS NULL ORDER BY built_in DESC, category, id`;
  return (rows as any[]).map(rowToCapability);
}

export async function getCapability(id: string): Promise<Capability | null> {
  const rows = await sql`SELECT * FROM capabilities WHERE id = ${id}`;
  return rows.length === 0 ? null : rowToCapability(rows[0]);
}

export async function getCapabilitiesByIds(ids: string[]): Promise<Capability[]> {
  if (ids.length === 0) return [];
  const rows = await sql`
    SELECT * FROM capabilities WHERE id = ANY(${ids as any}) AND archived_at IS NULL
  `;
  // Preserve requested order.
  const byId = new Map((rows as any[]).map(r => [r.id as string, rowToCapability(r)]));
  return ids.map(id => byId.get(id)).filter((c): c is Capability => !!c);
}

export async function updateCapability(
  id: string,
  fields: Partial<Pick<Capability, 'label' | 'description' | 'prompt_fragment' | 'config_json'>>,
): Promise<void> {
  await sql`
    UPDATE capabilities SET
      label           = COALESCE(${fields.label ?? null}, label),
      description     = COALESCE(${fields.description ?? null}, description),
      prompt_fragment = COALESCE(${fields.prompt_fragment ?? null}, prompt_fragment),
      config_json     = COALESCE(${fields.config_json ? JSON.stringify(fields.config_json) : null}::jsonb, config_json),
      updated_at      = now()
    WHERE id = ${id}
  `;
}

export async function createCapability(args: {
  id: string;
  label: string;
  category: CapabilityCategory;
  description: string;
  prompt_fragment: string;
  config_json?: Record<string, unknown>;
}): Promise<void> {
  await sql`
    INSERT INTO capabilities
      (id, label, category, description, prompt_fragment, config_json, built_in)
    VALUES
      (${args.id}, ${args.label}, ${args.category}, ${args.description},
       ${args.prompt_fragment},
       ${JSON.stringify(args.config_json || {})}::jsonb, false)
  `;
}

export async function archiveCapability(id: string): Promise<{ ok: boolean; reason?: string }> {
  const cap = await getCapability(id);
  if (!cap) return { ok: false, reason: 'not_found' };
  if (cap.built_in) return { ok: false, reason: 'built_in' };
  await sql`UPDATE capabilities SET archived_at = now(), updated_at = now() WHERE id = ${id}`;
  return { ok: true };
}

/**
 * Returns the capability ids that should apply for a given doc-type today.
 *
 * Phase 2 preserves the existing doc_types.apply_financial_rules semantics:
 * `language`, `structure`, `format` always; `financial` and `cost` only when the
 * doc-type opts in. Phase 5 replaces this with doc_types.default_capability_ids.
 */
export function defaultCapabilityIdsForDocType(docType: {
  apply_financial_rules?: boolean;
}): string[] {
  const ids = ['language', 'structure', 'format'];
  if (docType.apply_financial_rules !== false) ids.push('financial', 'cost');
  return ids;
}
