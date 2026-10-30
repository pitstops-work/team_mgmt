import { parseBudgetExcel, type BudgetDiagnostics } from '@/lib/review/extractDocs';
import AdmZip from 'adm-zip';

export type TextDoc = { name: string; text: string };
export type ImageDoc = { name: string; mediaType: 'image/jpeg' | 'image/png'; base64: string };
export type PdfDoc = { name: string; base64: string };
export type ExtractedImage = {
  name: string;
  buffer: Buffer;
  mediaType: 'image/jpeg' | 'image/png';
  blobUrl?: string;
};

async function extractPdfText(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>;
  const data = await pdfParse(buffer);
  return data.text;
}

// Rasterize the *drawing/figure* pages of a PDF to PNGs so the model can embed
// the real source drawing (via <img>) instead of redrawing it as a Mermaid graph.
// A page is treated as a figure when it carries little extractable text — i.e.
// it is a plan, elevation, section, sketch, map, or scan rather than prose.
// Below this a page is treated as "a figure". Set high because civil/CAD
// drawings carry many dimension labels and notes yet are still drawings; a
// genuine prose page typically runs 1,500+ chars.
const PDF_FIGURE_TEXT_THRESHOLD = 900; // chars
const PDF_MAX_PAGES_SCANNED = 60;
const PDF_MAX_FIGURES = 15;
const PDF_RASTER_TARGET_WIDTH = 1600; // px on the long-ish edge
const PDF_RASTER_MAX_BYTES = 2_500_000;

export async function rasterizePdfFigurePages(buffer: Buffer, docName: string): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];
  try {
    const mupdf: any = await import('mupdf');
    const doc = mupdf.Document.openDocument(new Uint8Array(buffer), 'application/pdf');
    const total = Math.min(doc.countPages(), PDF_MAX_PAGES_SCANNED);
    const lens: number[] = [];
    for (let i = 0; i < total && images.length < PDF_MAX_FIGURES; i++) {
      const page = doc.loadPage(i);
      let pageText = '';
      try { pageText = page.toStructuredText('preserve-whitespace').asText() || ''; } catch { /* no text layer */ }
      lens.push(pageText.trim().length);
      if (pageText.trim().length >= PDF_FIGURE_TEXT_THRESHOLD) continue; // prose page — skip

      const bounds = page.getBounds(); // [x0, y0, x1, y1] in points
      const ptWidth = Math.max(1, bounds[2] - bounds[0]);
      const scale = Math.min(3, Math.max(1, PDF_RASTER_TARGET_WIDTH / ptWidth));
      const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = Buffer.from(pix.asPNG());
      pix.destroy?.();
      if (png.length < 1024 || png.length > PDF_RASTER_MAX_BYTES) continue; // blank or too heavy
      images.push({ name: `${docName}__page-${i + 1}.png`, buffer: png, mediaType: 'image/png' });
    }
    console.log(`[review-ingest] rasterize ${docName}: ${doc.countPages()} pages, per-page text lens=[${lens.join(',')}], rasterized ${images.length}`);
  } catch (e) {
    console.warn('[review-ingest] PDF rasterization FAILED for', docName, (e as Error).message, (e as Error).stack);
  }
  return images;
}

// ── Office text extraction ──────────────────────────────────────────────────
// Grant applications are mostly tables: settlement lists, ward/household
// counts, domain-wise plans. mammoth.extractRawText() flattens a table into one
// cell per line with no headers, no row boundaries and no totals, which leaves
// the model guessing ("over 100 families") where the document states a figure.
// So convert to HTML first and render tables as pipe rows.

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&'); // last, so &amp;lt; doesn't become <
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function tableToText(innerHtml: string): string {
  const rows: string[] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr: RegExpExecArray | null;
  while ((tr = trRe.exec(innerHtml)) !== null) {
    const cells: string[] = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let td: RegExpExecArray | null;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(cellText(td[1]));
    if (cells.some(Boolean)) rows.push(`| ${cells.join(' | ')} |`);
  }
  return rows.length > 0 ? `\n${rows.join('\n')}\n` : '';
}

/** Innermost-first, so a nested table doesn't swallow its parent's closing tag. */
function convertTables(html: string): string {
  let out = html;
  for (let pass = 0; pass < 10 && /<table/i.test(out); pass++) {
    const before = out;
    out = out.replace(/<table[^>]*>((?:(?!<table)[\s\S])*?)<\/table>/gi, (_, inner) => tableToText(inner));
    if (out === before) break; // unbalanced markup — stop rather than spin
  }
  return out;
}

function htmlToText(html: string): string {
  let out = convertTables(html);
  out = out
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/(p|h[1-6]|li|div|tr|table)>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '\n');
  out = decodeEntities(out.replace(/<[^>]+>/g, ''));
  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const text = htmlToText(html);
    if (text.trim().length > 0) return text;
    console.warn('[review-ingest] docx HTML conversion produced no text; falling back to raw text');
  } catch (e) {
    console.warn('[review-ingest] docx HTML conversion failed; falling back to raw text:', (e as Error).message);
  }
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

// A document is only truncated when it genuinely cannot fit, and never
// silently: the marker tells the model the corpus is incomplete.
const MAX_DOC_CHARS = 400_000;

function clampDocText(text: string, name: string, warnings: string[]): string {
  if (text.length <= MAX_DOC_CHARS) return text;
  const dropped = text.length - MAX_DOC_CHARS;
  const msg = `"${name}" is ${text.length} characters; ${dropped} were dropped to fit the ${MAX_DOC_CHARS}-character cap.`;
  console.warn('[review-ingest] TRUNCATED', msg);
  warnings.push(msg);
  return `${text.slice(0, MAX_DOC_CHARS)}\n\n[TRUNCATED — ${msg} Do not treat this document as complete; say so rather than concluding a fact is absent from it.]`;
}

async function extractPptxText(buffer: Buffer): Promise<string> {
  const officeParser = await import('officeparser');
  const result = await (officeParser.parseOffice as any)(buffer, { outputErrorToConsole: false });
  return typeof result === 'string' ? result : '';
}

export function extractImagesFromOfficeFile(buffer: Buffer, docName: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  try {
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    for (const entry of entries) {
      const name = entry.entryName.toLowerCase();
      if (!name.startsWith('ppt/media/') && !name.startsWith('word/media/')) continue;

      let mediaType: 'image/jpeg' | 'image/png' | null = null;
      if (name.endsWith('.jpg') || name.endsWith('.jpeg')) mediaType = 'image/jpeg';
      else if (name.endsWith('.png')) mediaType = 'image/png';
      if (!mediaType) continue;

      const imgBuffer = entry.getData();
      if (!imgBuffer || imgBuffer.length < 512 || imgBuffer.length > 600_000) continue;
      if (images.length >= 8) continue;

      const baseName = entry.entryName.split('/').pop() || `img-${images.length + 1}`;
      images.push({ name: `${docName}__${baseName}`, buffer: imgBuffer, mediaType });
    }
  } catch (e) {
    console.warn('Image extraction failed for', docName, (e as Error).message);
  }
  return images;
}

export async function uploadImagesToBlob(images: ExtractedImage[]): Promise<ExtractedImage[]> {
  if (images.length === 0) return images;
  const { put } = await import('@vercel/blob');
  // Use the PUBLIC blob store (BLOBS_READ_WRITE_TOKEN); the default
  // BLOB_READ_WRITE_TOKEN is a private store whose URLs the model/exporter
  // can't fetch. Mirrors lib/review/blob-upload token selection.
  const token = process.env.BLOBS_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  return Promise.all(images.map(async (img, i) => {
    try {
      const blob = await put(`extracted-${Date.now()}-${i}-${img.name}`, img.buffer, { access: 'public', token });
      return { ...img, blobUrl: blob.url };
    } catch (e) {
      console.warn('[review-ingest] Blob upload FAILED for', img.name, (e as Error).message);
      return img;
    }
  }));
}

export type ProcessedFile = {
  text?: TextDoc;
  image?: ImageDoc;
  pdf?: PdfDoc;
  budget?: string;
  extractedImages?: ExtractedImage[];
  /** Present for spreadsheets. `ok: false` means no figures were recovered. */
  budgetDiagnostics?: BudgetDiagnostics;
  /** Extraction problems the caller must surface rather than swallow. */
  warnings?: string[];
};

export async function processFileFromBuffer(
  file: { name: string; buffer: Buffer },
  asPdfDoc = false
): Promise<ProcessedFile> {
  const buffer = file.buffer;
  const name = file.name.toLowerCase();
  const warnings: string[] = [];

  if (name.endsWith('.pdf')) {
    let text = '';
    try { text = await extractPdfText(buffer); } catch {}
    // Rasterize drawing/figure pages so they can be embedded as real images.
    const figures = await rasterizePdfFigurePages(buffer, file.name);
    if (text.trim().length >= 200) {
      // Prose PDF — send the text, plus any drawing pages as embeddable images.
      return {
        text: { name: file.name, text: clampDocText(text, file.name, warnings) },
        extractedImages: figures,
        warnings,
      };
    }
    // Scanned / drawing PDF — rasterized pages are both readable and embeddable
    // (they carry blob URLs), so prefer them over the opaque document block.
    if (figures.length > 0) {
      return { extractedImages: figures };
    }
    if (buffer.length < 4_000_000) {
      return { pdf: { name: file.name, base64: buffer.toString('base64') } };
    }
    return { text: { name: file.name, text: `[PDF too large to embed — ${(buffer.length / 1024 / 1024).toFixed(1)} MB, text extraction yielded no usable content]` } };
  }

  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    const extractedImages = name.endsWith('.docx') ? extractImagesFromOfficeFile(buffer, file.name) : [];
    try {
      const text = await extractDocxText(buffer);
      return { text: { name: file.name, text: clampDocText(text, file.name, warnings) }, extractedImages, warnings };
    } catch (e) {
      const msg = `Could not extract text from Word document "${file.name}": ${(e as Error).message}`;
      console.error('[review-ingest]', msg);
      warnings.push(msg);
      return { text: { name: file.name, text: `[${msg}]` }, extractedImages, warnings };
    }
  }

  if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
    const extractedImages = name.endsWith('.pptx') ? extractImagesFromOfficeFile(buffer, file.name) : [];
    try {
      const text = await extractPptxText(buffer);
      return { text: { name: file.name, text: clampDocText(text, file.name, warnings) }, extractedImages, warnings };
    } catch (e) {
      const msg = `Could not extract text from PowerPoint "${file.name}": ${(e as Error).message}`;
      console.error('[review-ingest]', msg);
      warnings.push(msg);
      return { text: { name: file.name, text: `[${msg}]` }, extractedImages, warnings };
    }
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    try {
      const budget = parseBudgetExcel(buffer);
      const d = budget.diagnostics;
      if (!d.ok) {
        // Loud: a spreadsheet that parses to nothing used to reach the model as
        // "Total grant: ₹0", and the note was drafted against zero money.
        console.error(
          `[review-ingest] BUDGET PARSE FAILED for ${file.name} — sheets: [${d.sheetsSeen.join(', ')}] — ${d.warnings.join('; ')}`,
        );
        warnings.push(`Budget file "${file.name}" yielded no figures. ${d.warnings.join(' ')}`);
      } else if (d.warnings.length > 0) {
        console.warn(`[review-ingest] budget parse warnings for ${file.name}: ${d.warnings.join('; ')}`);
        warnings.push(...d.warnings.map(w => `Budget file "${file.name}": ${w}`));
      }
      return {
        budget: `=== BUDGET FILE: ${file.name} ===\n${budget.raw}`,
        budgetDiagnostics: d,
        warnings,
      };
    } catch (e) {
      const msg = `Could not parse Excel file "${file.name}": ${(e as Error).message}`;
      console.error('[review-ingest]', msg);
      warnings.push(msg);
      return {
        budget: `=== BUDGET FILE: ${file.name} ===\n=== BUDGET FILE COULD NOT BE READ ===\n${msg}\n\nDO NOT invent, infer, estimate or round any budget figure. State plainly in the note that the budget file could not be read, and leave every financial field as [to be filled].`,
        warnings,
      };
    }
  }

  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    if (buffer.length > 2_000_000) return { text: { name: file.name, text: `[JPEG image — ${(buffer.length / 1024 / 1024).toFixed(1)} MB, too large to embed]` } };
    // Surface as an extracted image so it receives a blob URL and can be embedded.
    return { extractedImages: [{ name: file.name, buffer, mediaType: 'image/jpeg' }] };
  }
  if (name.endsWith('.png')) {
    if (buffer.length > 2_000_000) return { text: { name: file.name, text: `[PNG image — ${(buffer.length / 1024 / 1024).toFixed(1)} MB, too large to embed]` } };
    return { extractedImages: [{ name: file.name, buffer, mediaType: 'image/png' }] };
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: { name: file.name, text: clampDocText(buffer.toString('utf-8'), file.name, warnings) }, warnings };
  }

  console.warn(`[review-ingest] unsupported file type, nothing extracted: ${file.name}`);
  return { warnings: [`"${file.name}" is not a file type the portal can read; nothing from it reached the draft.`] };
}

export async function downloadAndProcess(
  urls: string[],
  asPdfDoc = false
): Promise<{
  textDocs: TextDoc[];
  imageDocs: ImageDoc[];
  pdfDocs: PdfDoc[];
  budgetParts: string[];
  extractedImages: ExtractedImage[];
  budgetDiagnostics: BudgetDiagnostics[];
  warnings: string[];
}> {
  const textDocs: TextDoc[] = [];
  const imageDocs: ImageDoc[] = [];
  const pdfDocs: PdfDoc[] = [];
  const budgetParts: string[] = [];
  const extractedImages: ExtractedImage[] = [];
  const budgetDiagnostics: BudgetDiagnostics[] = [];
  const warnings: string[] = [];

  await Promise.all(urls.map(async (url) => {
    const rawName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
    const name = rawName.replace(/^\d+-/, '');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`fetch returned ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const result = await processFileFromBuffer({ name, buffer }, asPdfDoc);
      if (result.text) textDocs.push(result.text);
      if (result.image) imageDocs.push(result.image);
      if (result.pdf) pdfDocs.push(result.pdf);
      if (result.budget) budgetParts.push(result.budget);
      if (result.extractedImages) extractedImages.push(...result.extractedImages);
      if (result.budgetDiagnostics) budgetDiagnostics.push(result.budgetDiagnostics);
      if (result.warnings) warnings.push(...result.warnings);
    } catch (e) {
      // A source document that never arrived is the single most damaging silent
      // failure in this pipeline — the draft reads as if the document said nothing.
      const msg = `Source document "${name}" could not be read: ${(e as Error).message}`;
      console.error('[review-ingest]', msg);
      warnings.push(msg);
    }
  }));

  console.log(`[review-ingest] downloadAndProcess: ${urls.length} url(s) → text=${textDocs.length} pdfDoc=${pdfDocs.length} img=${imageDocs.length} budget=${budgetParts.length} extractedImages=${extractedImages.length} warnings=${warnings.length}`);
  if (warnings.length > 0) console.warn('[review-ingest] corpus warnings:', warnings);
  return { textDocs, imageDocs, pdfDocs, budgetParts, extractedImages, budgetDiagnostics, warnings };
}

const MAX_PAYLOAD_BYTES = 18_000_000;

export function buildMessageContent(
  textDocs: TextDoc[],
  imageDocs: ImageDoc[],
  pdfDocs: PdfDoc[],
  budgetParts: string[],
  uploadedImages: ExtractedImage[] = [],
  corpusWarnings: string[] = []
): any[] {
  const content: any[] = [];
  const skipped: string[] = [];
  let payloadBytes = 0;

  const add = (item: any, approxBytes: number, label?: string) => {
    if (payloadBytes + approxBytes > MAX_PAYLOAD_BYTES) {
      const msg = `${label || 'an attachment'} was dropped — the request would exceed ${MAX_PAYLOAD_BYTES / 1e6} MB`;
      console.error('[review-ingest] buildMessageContent:', msg);
      skipped.push(msg);
      return;
    }
    payloadBytes += approxBytes;
    content.push(item);
  };

  for (const pd of pdfDocs) {
    add({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: pd.base64 },
      title: pd.name,
    }, pd.base64.length, `PDF "${pd.name}"`);
  }

  for (const img of imageDocs) {
    add({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } }, img.base64.length, `image "${img.name}"`);
  }

  for (const img of uploadedImages) {
    if (!img.blobUrl) continue;
    const b64 = img.buffer.toString('base64');
    add({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: b64 } }, b64.length, `image "${img.name}"`);
    add({ type: 'text', text: `[Above image is stored at: ${img.blobUrl} — use this URL in <img> tags]` }, 100);
  }

  for (const td of textDocs) {
    add({ type: 'text', text: `=== ${td.name} ===\n${td.text}` }, td.text.length, `document "${td.name}"`);
  }

  for (const b of budgetParts) {
    add({ type: 'text', text: b }, b.length, 'the budget file');
  }

  // Tell the model what it is missing. Without this it cannot distinguish "the
  // documents don't say" from "the pipeline didn't deliver it".
  const allWarnings = [...corpusWarnings, ...skipped];
  if (allWarnings.length > 0) {
    content.push({
      type: 'text',
      text: [
        '=== SOURCE CORPUS IS INCOMPLETE ===',
        ...allWarnings.map(w => `- ${w}`),
        '',
        'Treat the affected material as unavailable, not as absent from the source.',
        'Leave the fields it would have supplied as [to be filled], and do not',
        'invent, infer, estimate or round any figure it would have carried.',
      ].join('\n'),
    });
  }

  return content;
}
