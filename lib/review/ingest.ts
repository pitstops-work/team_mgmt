// Phase 0 ingestion: fetch a source doc from Blob, extract text, chunk,
// embed via Voyage, persist into source_chunks. Idempotent per (note_id, doc_url).

import { sql } from './db';
import { processFileFromBuffer } from './processFiles';
import { parseBudgetExcel } from './extractDocs';
import { chunkText } from './chunking';
import { embedTexts, toPgVector } from './embedding';

export type IngestResult = {
  note_id: string;
  doc_url: string;
  doc_name: string;
  status: 'inserted' | 'skipped_existing' | 'no_text' | 'unsupported';
  chunks: number;
};

function fileNameFromUrl(url: string): string {
  const raw = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
  return raw.replace(/^\d+-/, '');
}

async function alreadyIngested(noteId: string, docUrl: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM source_chunks
    WHERE note_id = ${noteId}::uuid AND doc_url = ${docUrl}
    LIMIT 1
  `;
  return rows.length > 0;
}

async function extractText(name: string, buffer: Buffer): Promise<string> {
  // Excel: structured raw text via parseBudgetExcel (same as the rest of the portal).
  if (/\.(xlsx|xls)$/i.test(name)) {
    try {
      const budget = parseBudgetExcel(buffer);
      return budget.raw || '';
    } catch {
      return '';
    }
  }

  const result = await processFileFromBuffer({ name, buffer });
  if (result.text) return result.text.text;
  return '';
}

export async function ingestSourceDoc(args: {
  noteId: string;
  docUrl: string;
  docName?: string;
}): Promise<IngestResult> {
  const { noteId, docUrl } = args;
  const docName = args.docName || fileNameFromUrl(docUrl);

  if (await alreadyIngested(noteId, docUrl)) {
    return { note_id: noteId, doc_url: docUrl, doc_name: docName, status: 'skipped_existing', chunks: 0 };
  }

  const res = await fetch(docUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${docUrl}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const text = await extractText(docName, buffer);
  if (!text.trim()) {
    return { note_id: noteId, doc_url: docUrl, doc_name: docName, status: 'no_text', chunks: 0 };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { note_id: noteId, doc_url: docUrl, doc_name: docName, status: 'no_text', chunks: 0 };
  }

  const embeddings = await embedTexts(chunks, 'document');

  const metadata = { doc_size: buffer.length, source_kind: kindFromName(docName) };
  const metadataJson = JSON.stringify(metadata);

  // Insert sequentially to keep memory bounded for large docs.
  for (let i = 0; i < chunks.length; i++) {
    const vec = toPgVector(embeddings[i]);
    await sql`
      INSERT INTO source_chunks
        (note_id, doc_url, doc_name, chunk_index, chunk_text, embedding, metadata)
      VALUES
        (${noteId}::uuid, ${docUrl}, ${docName}, ${i}, ${chunks[i]},
         ${vec}::vector, ${metadataJson}::jsonb)
      ON CONFLICT (note_id, doc_url, chunk_index) DO NOTHING
    `;
  }

  return { note_id: noteId, doc_url: docUrl, doc_name: docName, status: 'inserted', chunks: chunks.length };
}

function kindFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx') || lower.endsWith('.doc')) return 'word';
  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'powerpoint';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'excel';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text';
  return 'other';
}
