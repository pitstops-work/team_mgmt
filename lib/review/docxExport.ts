import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, ImageRun,
} from 'docx';
import { Resvg } from '@resvg/resvg-js';
import path from 'path';

const FONT_FILES = [
  path.join(process.cwd(), 'lib/review/fonts/NotoSans-Regular.ttf'),
  path.join(process.cwd(), 'lib/review/fonts/NotoSansMono-Regular.ttf'),
];

// ── Image utilities ──────────────────────────────────────────────────────────

type ImageEntry = { buffer: Buffer; type: 'png' | 'jpg'; w: number; h: number };

function readImageSize(buf: Buffer): { w: number; h: number } {
  // PNG: signature 89 50, dimensions at bytes 16-23
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF marker
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 8) {
      if (buf[i] !== 0xFF) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  return { w: 800, h: 500 };
}

function extractImgUrls(html: string): string[] {
  const urls: string[] = [];
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/gi)) urls.push(m[1]);
  return urls;
}

async function prefetchImages(htmlList: string[]): Promise<Map<string, ImageEntry>> {
  const urls = new Set<string>();
  for (const html of htmlList) extractImgUrls(html).forEach(u => urls.add(u));
  const map = new Map<string, ImageEntry>();
  await Promise.all([...urls].map(async url => {
    try {
      const res = await fetch(url);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = res.headers.get('content-type') || '';
      const type = (url.toLowerCase().includes('.jpg') || url.toLowerCase().includes('.jpeg') || ct.includes('jpeg')) ? 'jpg' : 'png';
      map.set(url, { buffer: buf, type, ...readImageSize(buf) });
    } catch { /* skip unfetchable images */ }
  }));
  return map;
}

function renderSvgToPng(svgString: string): Buffer | null {
  try {
    let svg = svgString;
    // Inject explicit width/height from viewBox so resvg knows the canvas size
    const vb = svg.match(/viewBox="([^"]+)"/);
    if (vb && !/\swidth=/.test(svg)) {
      const parts = vb[1].trim().split(/\s+/);
      if (parts.length === 4) {
        svg = svg.replace('<svg ', `<svg width="${parts[2]}" height="${parts[3]}" `);
      }
    }
    // Strip custom font names — use only generic families that resvg has built-in
    svg = svg.replace(/font-family="[^"]*"/gi, (m) => {
      if (/mono/i.test(m)) return 'font-family="monospace"';
      if (/serif/i.test(m)) return 'font-family="serif"';
      return 'font-family="sans-serif"';
    });
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 900 },
      font: { loadSystemFonts: false, fontFiles: FONT_FILES },
    });
    return Buffer.from(resvg.render().asPng());
  } catch { return null; }
}

// ── HTML → docx paragraphs ───────────────────────────────────────────────────

function decodeEntities(t: string): string {
  return t
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&rsquo;/g, "'").replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"').replace(/&rdquo;/g, '"').replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—').replace(/&#8377;/g, '₹').replace(/&#\d+;/g, '')
    .replace(/&[a-z]+;/g, '');
}

function parseInlineHtml(html: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = html.split(/(<(?:strong|b)[^>]*>[\s\S]*?<\/(?:strong|b)>|<(?:em|i)[^>]*>[\s\S]*?<\/(?:em|i)>)/gi);
  for (const part of parts) {
    if (!part) continue;
    if (/^<(?:strong|b)/i.test(part)) {
      const text = decodeEntities(part.replace(/<[^>]+>/g, '').trim());
      if (text) runs.push(new TextRun({ text, bold: true }));
    } else if (/^<(?:em|i)/i.test(part)) {
      const text = decodeEntities(part.replace(/<[^>]+>/g, '').trim());
      if (text) runs.push(new TextRun({ text, italics: true }));
    } else {
      const text = decodeEntities(part.replace(/<[^>]+>/g, ''));
      if (text) runs.push(new TextRun(text));
    }
  }
  return runs;
}

function imageParas(entry: ImageEntry, caption: string): Paragraph[] {
  const maxW = 450;
  const scale = Math.min(1, maxW / entry.w);
  const dispW = Math.round(entry.w * scale);
  const dispH = Math.round(entry.h * scale);
  const paras: Paragraph[] = [
    new Paragraph({
      children: [new ImageRun({ type: entry.type, data: entry.buffer, transformation: { width: dispW, height: dispH } })],
      spacing: { before: 120, after: caption ? 40 : 120 },
    }),
  ];
  if (caption) {
    paras.push(new Paragraph({
      children: [new TextRun({ text: decodeEntities(caption.replace(/<[^>]+>/g, '')), italics: true, size: 18, color: '777777' })],
      spacing: { before: 0, after: 120 },
    }));
  }
  return paras;
}

// ── Depth-aware HTML table parsing (handles tables nested inside cells) ───────

// From the '<' of a <table…> at openStart, return the index just past its
// matching </table>, accounting for nested tables. -1 if unbalanced.
function findMatchingTableEnd(html: string, openStart: number): number {
  const re = /<table\b[^>]*>|<\/table\s*>/gi;
  re.lastIndex = openStart;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0][1] === '/') { depth--; if (depth === 0) return m.index + m[0].length; }
    else depth++;
  }
  return -1;
}

// Replace each TOP-LEVEL <table>…</table> with a placeholder, storing its raw
// inner HTML (nested tables left intact for recursive rendering).
function extractTopLevelTables(h: string, store: Map<string, string>): string {
  let out = '';
  let idx = 0;
  for (;;) {
    const rel = h.slice(idx).search(/<table\b/i);
    if (rel === -1) { out += h.slice(idx); break; }
    const start = idx + rel;
    out += h.slice(idx, start);
    const end = findMatchingTableEnd(h, start);
    if (end === -1) { out += h.slice(start); break; } // malformed — leave as-is
    const full = h.slice(start, end);
    const inner = full.slice(full.indexOf('>') + 1, full.lastIndexOf('</table'));
    const key = `__TABLE_${store.size}__`;
    store.set(key, inner);
    out += `\n${key}\n`;
    idx = end;
  }
  return out;
}

// Top-level <tr> inner HTML within a table (ignores <tr> of nested tables).
function topLevelRowHtmls(inner: string): string[] {
  const rows: string[] = [];
  const re = /<table\b[^>]*>|<\/table\s*>|<tr\b[^>]*>|<\/tr\s*>/gi;
  let depth = 0, trStart = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    const t = m[0].toLowerCase();
    if (t.startsWith('<table')) depth++;
    else if (t.startsWith('</table')) depth--;
    else if (depth === 0 && t.startsWith('<tr')) trStart = m.index + m[0].length;
    else if (depth === 0 && t.startsWith('</tr') && trStart !== -1) { rows.push(inner.slice(trStart, m.index)); trStart = -1; }
  }
  return rows;
}

type CellParse = { html: string; isHeader: boolean; colspan: number };

// Top-level <td>/<th> within a row (ignores cells of nested tables).
function topLevelCells(rowHtml: string): CellParse[] {
  const cells: CellParse[] = [];
  const re = /<table\b[^>]*>|<\/table\s*>|<(td|th)\b([^>]*)>|<\/(?:td|th)\s*>/gi;
  let depth = 0, start = -1, isHeader = false, colspan = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rowHtml))) {
    const t = m[0].toLowerCase();
    if (t.startsWith('<table')) depth++;
    else if (t.startsWith('</table')) depth--;
    else if (depth === 0 && m[1]) {
      start = m.index + m[0].length;
      isHeader = m[1].toLowerCase() === 'th';
      const cs = (m[2] || '').match(/colspan\s*=\s*['"]?(\d+)/i);
      colspan = cs ? Math.max(1, parseInt(cs[1], 10)) : 1;
    } else if (depth === 0 && (t.startsWith('</td') || t.startsWith('</th')) && start !== -1) {
      cells.push({ html: rowHtml.slice(start, m.index), isHeader, colspan });
      start = -1; isHeader = false; colspan = 1;
    }
  }
  return cells;
}

function tableRowsFromInner(inner: string, imageCache: Map<string, ImageEntry>): TableRow[] {
  const rows: TableRow[] = [];
  for (const rowHtml of topLevelRowHtmls(inner)) {
    const parsed = topLevelCells(rowHtml);
    if (parsed.length === 0) continue;
    const cells = parsed.map(c => {
      // Header cells: one bold line. Body cells: recurse so nested tables, lists
      // and paragraphs render correctly instead of being flattened.
      const children: (Paragraph | Table)[] = c.isHeader
        ? [new Paragraph({
            children: [new TextRun({ text: decodeEntities(c.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), bold: true, size: 20 })],
            spacing: { before: 0, after: 0 },
          })]
        : htmlToParas(c.html, imageCache);
      return new TableCell({
        ...(c.colspan > 1 ? { columnSpan: c.colspan } : {}),
        margins: { top: 80, bottom: 80, left: 100, right: 100 },
        borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
        ...(c.isHeader ? { shading: { type: ShadingType.SOLID, color: 'F2F2EC', fill: 'F2F2EC' } } : {}),
        children: children.length > 0 ? children : [new Paragraph('')],
      });
    });
    rows.push(new TableRow({ children: cells }));
  }
  return rows;
}

export function htmlToParas(html: string, imageCache: Map<string, ImageEntry> = new Map()): (Paragraph | Table)[] {
  if (!html?.trim()) return [new Paragraph('')];
  const paras: (Paragraph | Table)[] = [];

  // 0. Extract top-level tables FIRST so nested tables / cell markup survive for
  //    recursive rendering (depth-aware — non-greedy regex cannot nest).
  const tableInnerMap = new Map<string, string>();
  let h = extractTopLevelTables(html, tableInnerMap);

  // 0b. Extract inline SVG blocks → render to PNG
  const svgMap = new Map<string, string>();
  h = h.replace(/<svg[\s\S]*?<\/svg>/gi, (svgFull) => {
    const key = `__SVG_${svgMap.size}__`;
    svgMap.set(key, svgFull);
    return `\n${key}\n`;
  });

  // 1. Collect and replace <figure class="doc-image"> blocks with placeholders
  const figureMap = new Map<string, { src: string; caption: string }>();
  h = h.replace(/<figure[^>]*class="doc-image"[^>]*>([\s\S]*?)<\/figure>/gi, (_m, inner) => {
    const srcM = inner.match(/src="([^"]+)"/);
    const capM = inner.match(/<figcaption>([\s\S]*?)<\/figcaption>/i);
    const src = srcM ? srcM[1] : '';
    const caption = capM ? capM[1] : '';
    const key = `__FIG_${figureMap.size}__`;
    if (src) figureMap.set(key, { src, caption });
    return `\n${key}\n`;
  });

  // 2. Bare <img> tags → placeholder
  const imgMap = new Map<string, string>();
  h = h.replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, (_m, src) => {
    const key = `__IMG_${imgMap.size}__`;
    imgMap.set(key, src);
    return `\n${key}\n`;
  });

  // 3. image-ref divs → readable text
  h = h.replace(/<div[^>]*class="image-ref"[^>]*>([\s\S]*?)<\/div>/gi, (_m, inner) => {
    const label = ((inner.match(/<div[^>]*class="image-ref-label"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
    const desc = ((inner.match(/<p[^>]*class="image-ref-desc"[^>]*>([\s\S]*?)<\/p>/i) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
    return `\n[Image: ${label}${desc ? ' — ' + desc : ''}]\n`;
  });

  // 4. stat-row blocks → readable "VAL (Label)" text per item
  h = h.replace(/<div[^>]*class="stat-item"[^>]*>([\s\S]*?)<\/div>/gi, (_m, inner) => {
    const val = ((inner.match(/<span[^>]*class="stat-val"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
    const label = ((inner.match(/<span[^>]*class="stat-label"[^>]*>([\s\S]*?)<\/span>/i) || [])[1] || '').replace(/<[^>]+>/g, '').trim();
    return label ? `${val} (${label})  ` : val;
  });
  h = h.replace(/<div[^>]*class="stat-row"[^>]*>/gi, '\n__STATROW__');
  h = h.replace(/__STATROW__([\s\S]*?)<\/div>/gi, (_m, inner) => `\n${inner.trim()}\n`);

  // (tables were already extracted in step 0)

  h = h.replace(/<li[^>]*>/gi, '\n__BULLET__');
  h = h.replace(/<\/p>|<\/li>|<br\s*\/?>/gi, '\n');
  // Strip tags but keep inline emphasis so parseInlineHtml can render it.
  h = h.replace(/<(?!\/?(?:strong|b|em|i)\b)[^>]+>/gi, '');
  h = decodeEntities(h);

  for (const line of h.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // SVG placeholder → render to PNG
    const svgContent = svgMap.get(trimmed);
    if (svgContent !== undefined) {
      const pngBuf = renderSvgToPng(svgContent);
      if (pngBuf) {
        const dims = readImageSize(pngBuf);
        paras.push(...imageParas({ buffer: pngBuf, type: 'png', ...dims }, ''));
      } else {
        paras.push(new Paragraph({
          children: [new TextRun({ text: '[Diagram — see online review for visual]', italics: true, color: '999999', size: 18 })],
        }));
      }
      continue;
    }

    // Figure placeholder
    const figEntry = figureMap.get(trimmed);
    if (figEntry) {
      const cached = imageCache.get(figEntry.src);
      if (cached) {
        paras.push(...imageParas(cached, figEntry.caption));
      } else {
        paras.push(new Paragraph({
          children: [new TextRun({ text: `[Image — see online review]`, italics: true, color: '999999', size: 18 })],
        }));
      }
      continue;
    }

    // Bare img placeholder
    const imgSrc = imgMap.get(trimmed);
    if (imgSrc) {
      const cached = imageCache.get(imgSrc);
      if (cached) {
        paras.push(...imageParas(cached, ''));
      } else {
        paras.push(new Paragraph({
          children: [new TextRun({ text: `[Image — see online review]`, italics: true, color: '999999', size: 18 })],
        }));
      }
      continue;
    }

    // HTML table placeholder → Word Table (depth-aware, recursive cells)
    const tableInner = tableInnerMap.get(trimmed);
    if (tableInner !== undefined) {
      const tableRows = tableRowsFromInner(tableInner, imageCache);
      if (tableRows.length > 0) {
        paras.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER, insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER },
          rows: tableRows,
        }));
        paras.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 80, after: 80 } }));
      }
      continue;
    }

    const isBullet = trimmed.startsWith('__BULLET__');
    const text = trimmed.replace('__BULLET__', '').trim();
    if (!text) continue;
    const runs = parseInlineHtml(text);
    paras.push(new Paragraph({
      children: runs.length > 0 ? runs : [new TextRun(text)],
      ...(isBullet ? { bullet: { level: 0 } } : { spacing: { before: 40, after: 40 } }),
    }));
  }

  return paras.length > 0 ? paras : [new Paragraph('')];
}

// ── Table helpers ────────────────────────────────────────────────────────────

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D4D4CC' };

function labelCell(text: string): TableCell {
  return new TableCell({
    width: { size: 28, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.SOLID, color: 'F2F2EC', fill: 'F2F2EC' },
    margins: { top: 100, bottom: 100, left: 120, right: 80 },
    borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: NO_BORDER, right: THIN_BORDER },
    children: [new Paragraph({
      children: [new TextRun({ text, bold: true, size: 20 })],
      spacing: { before: 0, after: 0 },
    })],
  });
}

function contentCell(paras: (Paragraph | Table)[]): TableCell {
  return new TableCell({
    width: { size: 72, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 100 },
    borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: paras,
  });
}

type BlockEntry = { id?: string; type: string; text: string };

function blocksToParas(blocks: BlockEntry[]): Paragraph[] {
  if (!blocks?.length) return [];
  const BLOCK_STYLE: Record<string, { label: string; fill: string; border: string }> = {
    decision:   { label: 'OPEN DECISION',   fill: 'F2E8C8', border: 'B8500A' },
    assumption: { label: 'ASSUMPTION',      fill: 'F0F0EA', border: '888880' },
    settled:    { label: 'SETTLED',         fill: 'DCE8E0', border: '1F4D3A' },
    sign_off:   { label: 'SIGN-OFF NEEDED', fill: 'F3EDF7', border: '9B59B6' },
  };
  const paras: Paragraph[] = [];
  for (const b of blocks) {
    const cfg = BLOCK_STYLE[b.type] ?? { label: (b.type || 'NOTE').toUpperCase(), fill: 'F0F0EA', border: '888880' };
    const leftBorder = { style: BorderStyle.THICK, size: 12, color: cfg.border, space: 4 };
    const noBorder   = { style: BorderStyle.NONE,  size: 0,  color: 'FFFFFF', space: 0 };
    const shade = { type: ShadingType.SOLID, fill: cfg.fill, color: cfg.fill };
    paras.push(new Paragraph({
      children: [new TextRun({ text: cfg.label, bold: true, size: 16, font: 'Courier New', color: cfg.border, allCaps: true })],
      shading: shade,
      border: { left: leftBorder, top: noBorder, right: noBorder, bottom: noBorder },
      indent: { left: 200 },
      spacing: { before: 140, after: 0 },
    }));
    paras.push(new Paragraph({
      children: [new TextRun({ text: b.text || '', size: 20 })],
      shading: shade,
      border: { left: leftBorder, top: noBorder, right: noBorder, bottom: noBorder },
      indent: { left: 200 },
      spacing: { before: 20, after: 140 },
    }));
  }
  return paras;
}

function sectionToRow(title: string, contentHtml: string, imageCache: Map<string, ImageEntry>, blocks?: BlockEntry[]): TableRow {
  const paras: (Paragraph | Table)[] = [
    ...htmlToParas(contentHtml, imageCache),
    ...blocksToParas(blocks || []),
  ];
  return new TableRow({
    children: [
      labelCell(title),
      contentCell(paras),
    ],
  });
}

function tableHeaderRow(text: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        shading: { type: ShadingType.SOLID, color: '1A1A1A', fill: '1A1A1A' },
        margins: { top: 100, bottom: 100, left: 120, right: 100 },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20, allCaps: true })],
          spacing: { before: 0, after: 0 },
        })],
      }),
    ],
  });
}

function makeTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: THIN_BORDER, insideVertical: THIN_BORDER },
    rows,
  });
}

// True when a section's content is essentially one full-width table — the model
// authored its own layout, so we render it directly at full width rather than
// re-wrapping it in the narrow label|content column (which squeezes it).
function isSingleTableContent(html: string): boolean {
  const t = (html || '').trim();
  if (!/^<table\b/i.test(t)) return false;
  const end = findMatchingTableEnd(t, 0);
  if (end === -1) return false;
  return t.slice(end).replace(/<[^>]+>/g, '').trim().length === 0;
}

// Render a group of sections, preserving order: runs of text sections become a
// label|content table (with the black header bar); a section whose content is a
// single table is emitted full-width (it carries its own header row).
function renderSectionGroup(
  headerLabel: string,
  secs: SectionRow[],
  imageCache: Map<string, ImageEntry>,
): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  let pending: TableRow[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    out.push(makeTable([tableHeaderRow(headerLabel), ...pending]));
    out.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 160, after: 160 } }));
    pending = [];
  };
  for (const s of secs) {
    if (isSingleTableContent(s.content_html)) {
      flush();
      out.push(...htmlToParas(s.content_html, imageCache));
      out.push(...blocksToParas(s.blocks || []));
      out.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 160, after: 160 } }));
    } else {
      pending.push(sectionToRow(s.title, s.content_html, imageCache, s.blocks || []));
    }
  }
  flush();
  return out;
}

// ── Section classifier ───────────────────────────────────────────────────────

const FIN_KEYS = ['donor', 'statutory', 'accounting', 'financial summary', 'average annual', 'budget breakdown', 'budget detail', 'remarks', 'grant details', 'grant detail', 'annexure 1'];
const ANN_KEYS = ['annexure', 'detailed budget', 'line item'];

type SectionClass = 'header' | 'main' | 'financial' | 'annexure';

function classifySection(title: string): SectionClass {
  const t = title.toLowerCase();
  if (ANN_KEYS.some(k => t.includes(k))) return 'annexure';
  if (FIN_KEYS.some(k => t.includes(k))) return 'financial';
  return 'main';
}

// ── Metadata block ───────────────────────────────────────────────────────────

function metaPara(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20 }),
      new TextRun({ text: value || '—', size: 20 }),
    ],
    spacing: { before: 40, after: 40 },
  });
}

// ── Vitals block (from design path metadata) ─────────────────────────────────

function vitalsBlock(vitals: Record<string, any>): Paragraph[] {
  const paras: Paragraph[] = [];
  if (!vitals || Object.keys(vitals).length === 0) return paras;
  const labelMap: Record<string, string> = {
    grant_amount: 'Grant Amount', duration: 'Duration', beneficiaries: 'Beneficiaries',
    staff_count: 'Staff', geography: 'Geography', grant_number: 'Grant Number',
    dependency_pct: 'Dependency %',
  };
  paras.push(new Paragraph({
    children: [new TextRun({ text: 'Key Facts', bold: true, size: 22, allCaps: true, color: '1F4D3A' })],
    spacing: { before: 0, after: 80 },
  }));
  for (const [k, label] of Object.entries(labelMap)) {
    if (vitals[k] == null) continue;
    const val = k === 'dependency_pct' ? `${vitals[k]}%` : String(vitals[k]);
    paras.push(metaPara(label, val));
  }
  paras.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 60, after: 0 } }));
  return paras;
}

// ── Diagram block (mermaid → image via mermaid.ink) ─────────────────────────

async function renderMermaidImage(definition: string): Promise<ImageEntry | null> {
  try {
    // Mermaid does not interpret a literal backslash-n inside node labels — it
    // renders it verbatim. Convert to <br/> so multi-line labels lay out right.
    const cleaned = definition.replace(/\\n/g, '<br/>');
    const encoded = Buffer.from(cleaned.trim()).toString('base64');
    const url = `https://mermaid.ink/img/${encoded}?type=png&width=900`;
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null;
    return { buffer: buf, type: 'png', ...readImageSize(buf) };
  } catch { return null; }
}

async function diagramBlock(diagrams: Array<{ title: string; definition: string }>): Promise<Paragraph[]> {
  if (!diagrams || diagrams.length === 0) return [];
  // Render all diagrams in parallel
  const rendered = await Promise.all(diagrams.map(d => renderMermaidImage(d.definition)));
  const paras: Paragraph[] = [];
  for (let i = 0; i < diagrams.length; i++) {
    const d = diagrams[i];
    const img = rendered[i];
    paras.push(new Paragraph({
      children: [new TextRun({ text: d.title, bold: true, size: 20, color: '1F4D3A' })],
      spacing: { before: 200, after: 60 },
    }));
    if (img) {
      paras.push(...imageParas(img, ''));
    } else {
      // Render failed — show a clean placeholder, not a dump of raw Mermaid source.
      paras.push(new Paragraph({
        children: [new TextRun({ text: '(Diagram could not be rendered — see the online review for the visual.)', italics: true, size: 18, color: '999999' })],
        spacing: { before: 0, after: 60 },
      }));
    }
  }
  return paras;
}

// ── Markdown draft_text → simple sections ────────────────────────────────────

function draftTextToSections(text: string): Array<{ title: string; content: string; cls: SectionClass }> {
  const sections: Array<{ title: string; content: string; cls: SectionClass }> = [];
  const lines = text.split('\n');
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    // Pipe-table with content on the same line: | **Title** | Content... |
    // Must check this FIRST so the content column isn't discarded
    const pipeSameLine = line.match(/^\s*\|\s*\*\*([^*|]+)\*\*\s*\|\s*(.+?)\s*\|?\s*$/);
    if (pipeSameLine && pipeSameLine[1] && pipeSameLine[1].length < 80) {
      if (current) sections.push({ title: current.title, content: current.lines.join('\n'), cls: classifySection(current.title) });
      const content = (pipeSameLine[2] || '').replace(/\|\s*$/, '').trim();
      current = { title: pipeSameLine[1].trim(), lines: content ? [content] : [] };
      continue;
    }

    const headerMatch = line.match(/^\s*\|?\s*\*\*([^*|]+)\*\*\s*\|?/) ||
                        line.match(/^\s*#{1,3}\s+(.+)/) ||
                        line.match(/^\s*([A-Z][A-Za-z &:\/\-]+):\s*$/);

    if (headerMatch && headerMatch[1] && headerMatch[1].length < 80) {
      if (current) sections.push({ title: current.title, content: current.lines.join('\n'), cls: classifySection(current.title) });
      current = { title: headerMatch[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push({ title: current.title, content: current.lines.join('\n'), cls: classifySection(current.title) });
  return sections;
}

function markdownToParas(text: string): Paragraph[] {
  const paras: Paragraph[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) { paras.push(new Paragraph('')); continue; }
    const isBullet = t.startsWith('- ') || t.startsWith('• ') || t.startsWith('* ');
    const content = isBullet ? t.slice(2) : t;
    const runs = parseInlineHtml(content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
    paras.push(new Paragraph({
      children: runs.length > 0 ? runs : [new TextRun(content)],
      ...(isBullet ? { bullet: { level: 0 } } : { spacing: { before: 40, after: 40 } }),
    }));
  }
  return paras;
}

// ── Grant note Word document ─────────────────────────────────────────────────

type NoteData = {
  org_name: string; org_city?: string; meeting?: string; theme?: string;
  geography?: string; presented_by?: string; visited_by?: string;
  prog_visit_date?: string; fin_visit_date?: string; grm_date?: string;
  delay_rationale?: string; grant_number?: string; grant_amount?: string;
  grant_duration?: string; beneficiary_count?: string;
  doc_type?: string; draft_text?: string;
  vitals?: Record<string, any>;
  diagrams?: Array<{ title: string; definition: string }>;
};

type SectionRow = { title: string; content_html: string; blocks?: BlockEntry[] | null };

export async function buildGrantNoteDocx(note: NoteData, sections: SectionRow[]): Promise<Buffer> {
  const orgLine = [note.org_name, note.org_city].filter(Boolean).join(', ');
  const isProgDesign = note.doc_type === 'programme_design';

  // Pre-fetch all images referenced in content_html
  const imageCache = await prefetchImages(sections.map(s => s.content_html));

  const mainSections = sections.filter(s => classifySection(s.title) === 'main');
  const financialSections = sections.filter(s => classifySection(s.title) === 'financial');
  const annexureSections = sections.filter(s => classifySection(s.title) === 'annexure');

  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(new Paragraph({
    children: [new TextRun({ text: orgLine, bold: true, size: 32, font: 'Calibri' })],
    spacing: { before: 0, after: 120 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({
      text: isProgDesign ? 'Programme Design Note' : `Internal Grant Approval Note${note.grant_number ? ` — ${note.grant_number} Grant` : ''}`,
      size: 24, color: '777777', font: 'Calibri',
    })],
    spacing: { before: 0, after: 80 },
  }));

  // Metadata
  if (note.meeting) children.push(metaPara('Meeting', note.meeting));
  if (note.theme) children.push(metaPara('Theme', note.theme));
  if (note.grant_amount) children.push(metaPara('Grant amount', note.grant_amount));
  if (note.grant_duration) children.push(metaPara('Duration', `${note.grant_duration} years`));
  children.push(new Paragraph({ children: [new TextRun({ text: ' ', size: 12 })], spacing: { before: 60, after: 180, line: 200 } }));

  // Vitals block (design path)
  children.push(...vitalsBlock(note.vitals || {}));

  // Mermaid diagrams as images (async)
  children.push(...await diagramBlock(note.diagrams || []));

  // Main content
  if (mainSections.length > 0) {
    children.push(...renderSectionGroup(isProgDesign ? 'Programme Design' : 'Grant Note', mainSections, imageCache));
  }

  // Financial (grant notes only)
  if (!isProgDesign && financialSections.length > 0) {
    children.push(...renderSectionGroup('ANNEXURE 1: Financial Assessment', financialSections, imageCache));
  }

  // Annexure
  if (annexureSections.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'Annexure — Detailed Budget', bold: true, size: 24, allCaps: true })],
      spacing: { before: 300, after: 120 },
    }));
    for (const s of annexureSections) {
      children.push(...htmlToParas(s.content_html, imageCache));
    }
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 720 } } },
      children,
    }],
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
          paragraph: { spacing: { line: 276 } },
        },
      },
    },
    creator: 'Seeding Review Portal',
    title: `Grant Note — ${orgLine}`,
  });

  return Packer.toBuffer(doc);
}

// ── Freeflow document (programme design, custom doc types) ───────────────────
// Renders sections as flowing prose paragraphs + headings — no table wrapper.

export async function buildFreeflowDocx(note: NoteData, sections: SectionRow[]): Promise<Buffer> {
  const orgLine = [note.org_name, note.org_city].filter(Boolean).join(', ');
  const imageCache = await prefetchImages(sections.map(s => s.content_html));
  const children: (Paragraph | Table)[] = [];

  // Title block
  children.push(new Paragraph({
    children: [new TextRun({ text: orgLine, bold: true, size: 32, font: 'Calibri' })],
    spacing: { before: 0, after: 100 },
  }));
  if (note.meeting) {
    children.push(new Paragraph({
      children: [new TextRun({ text: note.meeting, size: 22, color: '777777', font: 'Calibri' })],
      spacing: { before: 0, after: 60 },
    }));
  }
  if (note.grant_amount || note.grant_duration) {
    const parts = [note.grant_amount, note.grant_duration ? `${note.grant_duration} years` : ''].filter(Boolean);
    children.push(new Paragraph({
      children: [new TextRun({ text: parts.join(' · '), size: 22, color: '777777', font: 'Calibri' })],
      spacing: { before: 0, after: 60 },
    }));
  }
  children.push(new Paragraph({ children: [new TextRun('')], spacing: { before: 0, after: 240 } }));

  // Vitals and diagrams
  children.push(...vitalsBlock(note.vitals || {}));
  children.push(...await diagramBlock(note.diagrams || []));

  // Each section: bold heading then content paragraphs
  for (const section of sections) {
    children.push(new Paragraph({
      children: [new TextRun({ text: section.title, bold: true, size: 26, font: 'Calibri', color: '1A1A1A' })],
      spacing: { before: 320, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E0E0D8', space: 4 } },
    }));
    children.push(...htmlToParas(section.content_html, imageCache));
    children.push(...blocksToParas(section.blocks || []));
  }

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 1080, right: 900 } } },
      children,
    }],
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
          paragraph: { spacing: { line: 288 } },
        },
      },
    },
    creator: 'Seeding Review Portal',
    title: orgLine,
  });

  return Packer.toBuffer(doc);
}

// ── Build from draft_text (draft stage — no sections in DB) ─────────────────

export async function buildFromDraftText(text: string, note: NoteData): Promise<Buffer> {
  const parsedSections = draftTextToSections(text);

  if (parsedSections.length < 2) {
    const paras = text.split('\n').map(line => {
      const t = line.trim();
      if (!t) return new Paragraph('');
      const runs = parseInlineHtml(t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'));
      return new Paragraph({ children: runs.length > 0 ? runs : [new TextRun(t)], spacing: { before: 40, after: 40 } });
    });
    const doc = new Document({
      sections: [{ children: paras }],
      creator: 'Seeding Review Portal',
      title: `Grant Note — ${note.org_name}`,
    });
    return Packer.toBuffer(doc);
  }

  const sections: SectionRow[] = parsedSections.map(s => ({
    title: s.title,
    content_html: s.content.split('\n').map(l => `<p>${l.trim()}</p>`).join(''),
  }));

  return buildGrantNoteDocx(note, sections);
}
