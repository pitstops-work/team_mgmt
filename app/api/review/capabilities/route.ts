import { ok, bad } from '@/lib/review/db';
import {
  getCapabilities, updateCapability, createCapability, archiveCapability,
  CapabilityCategory,
} from '@/lib/review/capabilities';

export const runtime = 'nodejs';

const VALID_CATEGORIES: CapabilityCategory[] = [
  'language', 'financial', 'structure', 'format', 'cost', 'compliance', 'custom',
];

function checkPass(req: Request): boolean {
  return req.headers.get('x-admin-passphrase') === process.env.STAFF_PASSPHRASE;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get('archived') === '1';
  const caps = await getCapabilities({ includeArchived });
  return ok({ capabilities: caps });
}

export async function PATCH(req: Request) {
  if (!checkPass(req)) return bad('Unauthorized', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { id, label, description, prompt_fragment, config_json } = body;
  if (!id || typeof id !== 'string') return bad('id required');

  await updateCapability(id, { label, description, prompt_fragment, config_json });
  return ok({ ok: true });
}

export async function POST(req: Request) {
  if (!checkPass(req)) return bad('Unauthorized', 401);

  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const { id, label, category, description, prompt_fragment, config_json } = body;
  if (!id || !label || !category || !description || !prompt_fragment) {
    return bad('id, label, category, description, prompt_fragment required');
  }
  if (!VALID_CATEGORIES.includes(category)) return bad(`invalid category: ${category}`);

  const normalisedId = String(id).toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  await createCapability({
    id: normalisedId, label, category, description, prompt_fragment,
    config_json: config_json || {},
  });
  return ok({ ok: true, id: normalisedId });
}

export async function DELETE(req: Request) {
  if (!checkPass(req)) return bad('Unauthorized', 401);

  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return bad('id required');

  const result = await archiveCapability(id);
  if (!result.ok) {
    if (result.reason === 'not_found') return bad('not found', 404);
    if (result.reason === 'built_in') return bad('cannot archive built-in capability', 400);
    return bad('archive failed');
  }
  return ok({ ok: true });
}
