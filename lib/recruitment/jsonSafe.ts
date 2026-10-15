/**
 * Make text storable in Postgres.
 *
 * Two things in a JS string are fine in memory and fatal on write: a NUL
 * character (JSONB and TEXT both reject \u0000) and a lone UTF-16 surrogate
 * (an invalid code point, rejected as malformed Unicode). Both turn up in text
 * pulled out of PDFs whose fonts map glyphs badly. Neither shows on screen, so
 * the CV reads fine, the model reads it fine, and the desk build then dies at
 * the database write with a bare 500 that names nothing.
 *
 * Applied where CV text enters the system and again where a desk is written,
 * because model output that quotes the CV can carry the same characters.
 */

const UNSTORABLE = /\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function storableText(s: string): string {
  return s.replace(UNSTORABLE, "");
}

/** Deep copy with every string made storable. Plain JSON data only. */
export function storable<T>(value: T): T {
  if (typeof value === "string") return storableText(value) as T;
  if (Array.isArray(value)) return value.map(storable) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[storableText(k)] = storable(v);
    return out as T;
  }
  return value;
}
