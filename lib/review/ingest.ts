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
  /**
   * `parse_failed` means the document was fetched but yielded nothing usable —
   * a spreadsheet whose layout we couldn't read, say. Distinct from `no_text`
   * (genuinely empty) and from an error, which the route reports separately.
   */
  status: 'inserted' | 'skipped_existing' | 'no_text' | 'unsupported' | 'parse_failed';
  chunks: number;
  /** Extraction problems. Non-empty means the corpus is incomplete. */
  warnings: string[];
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

async function extractText(
  name: string,
  buffer: Buffer,
): Promise<{ text: string; warnings: string[]; parseFailed: boolean }> {
  // Excel: structured raw text via parseBudgetExcel (same as the rest of the portal).
  if (/\.(xlsx|xls)$/i.test(name)) {
    try {
      const budget = parseBudgetExcel(buffer);
      const d = budget.diagnostics;
      if (!d.ok) {
        console.error(
          `[ingest] BUDGET PARSE FAILED for ${name} — sheets: [${d.sheetsSeen.join(', ')}] — ${d.warnings.join('; ')}`,
        );
      }
      return {
        // Store the text either way: when the parse failed it is the loud
        // "could not be read" block, which is what retrieval should surface.
        text: budget.raw || '',
        warnings: d.ok
          ? d.warnings
          : [`Budget file "${name}" yielded no figures. Sheets found: ${d.sheetsSeen.join(', ') || '(none)'}. ${d.warnings.join(' ')}`],
        parseFailed: !d.ok,
      };
    } catch (e) {
      const msg = `Could not parse Excel file "${name}": ${(e as Error).message}`;
      console.error('[ingest]', msg);
      return { text: '', warnings: [msg], parseFailed: true };
    }
  }

  const result = await processFileFromBuffer({ name, buffer });
  return {
    text: result.text?.text ?? '',
    warnings: result.warnings ?? [],
    parseFailed: false,
  };
}

export async function ingestSourceDoc(args: {
  noteId: string;
  docUrl: string;
  docName?: string;
}): Promise<IngestResult> {
  const { noteId, docUrl } = args;
  const docName = args.docName || fileNameFromUrl(docUrl);

  if (await alreadyIngested(noteId, docUrl)) {
    return { note_id: noteId, doc_url: docUrl, doc_name: docName, status: 'skipped_existing', chunks: 0, warnings: [] };
  }

  const res = await fetch(docUrl);
  if (!res.ok) throw new Error(`Failed to fetch ${docUrl}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const { text, warnings, parseFailed } = await extractText(docName, buffer);
  if (!text.trim()) {
    console.warn(`[ingest] no text extracted from ${docName}`);
    return {
      note_id: noteId, doc_url: docUrl, doc_name: docName,
      status: parseFailed ? 'parse_failed' : 'no_text', chunks: 0,
      warnings: warnings.length > 0 ? warnings : [`No text could be extracted from "${docName}".`],
    };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return {
      note_id: noteId, doc_url: docUrl, doc_name: docName,
      status: parseFailed ? 'parse_failed' : 'no_text', chunks: 0, warnings,
    };
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

  console.log(`[ingest] ${docName} → ${chunks.length} chunk(s), ${text.length} chars${parseFailed ? ' (PARSE FAILED — stored the failure notice)' : ''}`);
  return {
    note_id: noteId, doc_url: docUrl, doc_name: docName,
    status: parseFailed ? 'parse_failed' : 'inserted', chunks: chunks.length, warnings,
  };
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
