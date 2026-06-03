/**
 * Phase 0 migration — enables pgvector on REVIEW_DATABASE_URL and creates
 * source_chunks (cross-note RAG corpus for the review portal).
 *
 * Idempotent. Safe to re-run.
 *
 * Run: set -a && source .env.local && set +a && npx tsx scripts/migrate-source-chunks.ts
 */

import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.REVIEW_DATABASE_URL;
  if (!url) throw new Error('REVIEW_DATABASE_URL not set');
  const sql = neon(url);

  console.log('[source-chunks] enabling pgvector…');
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;

  console.log('[source-chunks] creating source_chunks…');
  await sql`
    CREATE TABLE IF NOT EXISTS source_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      note_id uuid NOT NULL,
      doc_url text NOT NULL,
      doc_name text NOT NULL,
      chunk_index int NOT NULL,
      chunk_text text NOT NULL,
      embedding vector(1024),
      metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(note_id, doc_url, chunk_index)
    )
  `;

  console.log('[source-chunks] creating indexes…');
  await sql`CREATE INDEX IF NOT EXISTS source_chunks_note_idx ON source_chunks(note_id)`;
  await sql`CREATE INDEX IF NOT EXISTS source_chunks_doc_url_idx ON source_chunks(note_id, doc_url)`;

  // HNSW index for cosine similarity. Build params are conservative defaults.
  await sql`
    CREATE INDEX IF NOT EXISTS source_chunks_embedding_idx
      ON source_chunks USING hnsw (embedding vector_cosine_ops)
  `;

  console.log('[source-chunks] done.');
}

main().catch(e => { console.error(e); process.exit(1); });
