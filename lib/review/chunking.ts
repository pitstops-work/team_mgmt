// Paragraph-aware text chunker.
// Target ~500 tokens per chunk (~2000 chars for English), 200-char overlap.

const CHUNK_CHARS = 2000;
const OVERLAP_CHARS = 200;
const MIN_CHUNK_CHARS = 200;

export function chunkText(text: string): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length === 0) return [];
  if (cleaned.length <= CHUNK_CHARS) return [cleaned];

  const out: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    let end = Math.min(start + CHUNK_CHARS, cleaned.length);

    if (end < cleaned.length) {
      const minBoundary = start + CHUNK_CHARS / 2;
      const lastPara = cleaned.lastIndexOf('\n\n', end);
      if (lastPara > minBoundary) {
        end = lastPara;
      } else {
        const lastSent = lastSentenceBoundary(cleaned, end);
        if (lastSent > minBoundary) end = lastSent;
      }
    }

    const chunk = cleaned.slice(start, end).trim();
    if (chunk.length >= MIN_CHUNK_CHARS || out.length === 0) out.push(chunk);

    if (end >= cleaned.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }

  return out;
}

function lastSentenceBoundary(text: string, before: number): number {
  for (let i = before; i > 0; i--) {
    const c = text[i];
    if ((c === '.' || c === '!' || c === '?') && (text[i + 1] === ' ' || text[i + 1] === '\n')) {
      return i + 1;
    }
  }
  return -1;
}
