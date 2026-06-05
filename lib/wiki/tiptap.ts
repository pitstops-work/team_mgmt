/**
 * Shared TipTap schema config + helpers for the v2 wiki (articles + spine).
 *
 * We store article bodies as TipTap JSON so mentions ([[wikilinks]]), tables,
 * and formatting all round-trip cleanly. To make authoring/seeding readable,
 * the seed format uses a compact `Block[]` shape that this module converts to
 * TipTap JSON server-side. The reader UI renders TipTap JSON directly.
 *
 * No DOM needed — this module is safe to import from API routes, seed scripts,
 * and React Server Components.
 */

// ── TipTap JSON shape (the minimum we use) ─────────────────────────────────

export type TipTapMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "code" }
  | { type: "link"; attrs: { href: string } }
  | { type: "wikilink"; attrs: { articleId: string; slug: string; title: string } };

export type TipTapNode =
  | { type: "text"; text: string; marks?: TipTapMark[] }
  | { type: "paragraph"; content?: TipTapNode[] }
  | { type: "heading"; attrs: { level: 1 | 2 | 3 | 4 }; content?: TipTapNode[] }
  | { type: "bulletList"; content?: TipTapNode[] }
  | { type: "orderedList"; content?: TipTapNode[] }
  | { type: "listItem"; content?: TipTapNode[] }
  | { type: "blockquote"; content?: TipTapNode[] }
  | { type: "horizontalRule" }
  | { type: "hardBreak" }
  | { type: "codeBlock"; content?: TipTapNode[] }
  | { type: "table"; content?: TipTapNode[] }
  | { type: "tableRow"; content?: TipTapNode[] }
  | { type: "tableCell"; content?: TipTapNode[] }
  | { type: "tableHeader"; content?: TipTapNode[] };

export type TipTapDoc = { type: "doc"; content: TipTapNode[] };

export const EMPTY_DOC: TipTapDoc = { type: "doc", content: [{ type: "paragraph" }] };

// ── Compact authoring shape (used in seed JSON) ────────────────────────────

export type Block =
  | string                                            // shorthand: paragraph
  | { p: string }                                     // paragraph
  | { h: 2 | 3 | 4; text: string }                    // heading (H1 reserved for title; not used in body)
  | { ul: string[] }                                  // bullet list
  | { ol: string[] }                                  // numbered list
  | { quote: string }                                 // blockquote
  | { table: { head: string[]; rows: string[][] } }   // table
  | { hr: true }                                      // horizontal rule
  | { code: string };                                 // code block

// ── Inline-formatting parser (minimal Markdown subset) ─────────────────────
//   **bold**     → bold mark
//   __underline__→ underline mark
//   *italic*     → italic mark (single asterisk; underscore reserved for underline)
//   `code`       → code mark
//   [text](url)  → link mark
// Mentions ([[Article Title]]) are NOT parsed here — they're inserted by the
// editor at runtime, not from seed text.

const INLINE_RE = /(\*\*([^*]+?)\*\*)|(__([^_]+?)__)|(\*([^*]+?)\*)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))/g;

export function parseInline(text: string): TipTapNode[] {
  if (!text) return [];
  const out: TipTapNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text))) {
    if (m.index > lastIndex) {
      out.push({ type: "text", text: text.slice(lastIndex, m.index) });
    }
    if (m[2] !== undefined) {
      out.push({ type: "text", text: m[2], marks: [{ type: "bold" }] });
    } else if (m[4] !== undefined) {
      out.push({ type: "text", text: m[4], marks: [{ type: "underline" }] });
    } else if (m[6] !== undefined) {
      out.push({ type: "text", text: m[6], marks: [{ type: "italic" }] });
    } else if (m[8] !== undefined) {
      out.push({ type: "text", text: m[8], marks: [{ type: "code" }] });
    } else if (m[10] !== undefined && m[11] !== undefined) {
      out.push({
        type: "text",
        text: m[10],
        marks: [{ type: "link", attrs: { href: m[11] } }],
      });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) {
    out.push({ type: "text", text: text.slice(lastIndex) });
  }
  return out.length ? out : [{ type: "text", text }];
}

// ── Block → TipTap node ────────────────────────────────────────────────────

function blockToNode(block: Block): TipTapNode {
  if (typeof block === "string") {
    return { type: "paragraph", content: parseInline(block) };
  }
  if ("p" in block) {
    return { type: "paragraph", content: parseInline(block.p) };
  }
  if ("h" in block) {
    return { type: "heading", attrs: { level: block.h }, content: parseInline(block.text) };
  }
  if ("ul" in block) {
    return {
      type: "bulletList",
      content: block.ul.map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: parseInline(item) }],
      })),
    };
  }
  if ("ol" in block) {
    return {
      type: "orderedList",
      content: block.ol.map((item) => ({
        type: "listItem",
        content: [{ type: "paragraph", content: parseInline(item) }],
      })),
    };
  }
  if ("quote" in block) {
    return { type: "blockquote", content: [{ type: "paragraph", content: parseInline(block.quote) }] };
  }
  if ("hr" in block) {
    return { type: "horizontalRule" };
  }
  if ("code" in block) {
    return { type: "codeBlock", content: [{ type: "text", text: block.code }] };
  }
  if ("table" in block) {
    const { head, rows } = block.table;
    return {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: head.map((cell) => ({
            type: "tableHeader",
            content: [{ type: "paragraph", content: parseInline(cell) }],
          })),
        },
        ...rows.map<TipTapNode>((row) => ({
          type: "tableRow",
          content: row.map((cell) => ({
            type: "tableCell",
            content: [{ type: "paragraph", content: parseInline(cell) }],
          })),
        })),
      ],
    };
  }
  // Fallback — should never hit unless authoring an unknown block kind.
  return { type: "paragraph", content: [{ type: "text", text: JSON.stringify(block) }] };
}

export function blocksToDoc(blocks: Block[]): TipTapDoc {
  const content = blocks.map(blockToNode);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

// ── Plain-text extraction (for search indexing) ────────────────────────────

export function docToPlainText(doc: TipTapDoc | undefined | null): string {
  if (!doc || !doc.content) return "";
  const out: string[] = [];
  const walk = (nodes: TipTapNode[] | undefined): void => {
    if (!nodes) return;
    for (const n of nodes) {
      if (n.type === "text") {
        out.push(n.text);
      } else if ("content" in n && n.content) {
        walk(n.content);
        // Add a separator after block-level nodes for readability/search.
        if (
          n.type === "paragraph" ||
          n.type === "heading" ||
          n.type === "listItem" ||
          n.type === "blockquote"
        ) {
          out.push(" ");
        }
      }
    }
  };
  walk(doc.content);
  return out.join("").replace(/\s+/g, " ").trim();
}
