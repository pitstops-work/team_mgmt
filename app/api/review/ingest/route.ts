import { ok, bad } from '@/lib/review/db';
import { ingestSourceDoc, IngestResult } from '@/lib/review/ingest';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return bad('invalid json'); }

  const noteId: string = body.note_id || body.noteId;
  const docUrls: string[] = Array.isArray(body.doc_urls)
    ? body.doc_urls
    : (body.doc_url ? [body.doc_url] : []);

  if (!noteId) return bad('note_id required');
  if (docUrls.length === 0) return bad('doc_url or doc_urls required');

  const results: IngestResult[] = [];
  const errors: Array<{ doc_url: string; error: string }> = [];

  for (const docUrl of docUrls) {
    try {
      const r = await ingestSourceDoc({ noteId, docUrl });
      results.push(r);
    } catch (e: any) {
      console.error('[ingest] failed', docUrl, e?.message);
      errors.push({ doc_url: docUrl, error: e?.message || 'ingest failed' });
    }
  }

  return ok({ results, errors });
}
