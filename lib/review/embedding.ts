// Voyage AI embedding client for the review portal.
// voyage-3 → 1024-dim cosine.

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3';
const BATCH_SIZE = 128;

export const VOYAGE_DIM = 1024;

type InputType = 'document' | 'query';

type VoyageResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage?: { total_tokens: number };
};

export async function embedTexts(
  texts: string[],
  inputType: InputType = 'document',
): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY not set');
  if (texts.length === 0) return [];

  const out: number[][] = new Array(texts.length);

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);

    const res = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: batch,
        model: VOYAGE_MODEL,
        input_type: inputType,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Voyage embed failed: ${res.status} ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as VoyageResponse;
    for (const item of data.data) {
      out[start + item.index] = item.embedding;
    }
  }

  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text], 'query');
  return v;
}

// Postgres array literal for a pgvector column: '[0.1,0.2,...]'
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}
