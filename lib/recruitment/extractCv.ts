/**
 * CV extractor — reads a candidate CV into `{ text, images }` for a Claude
 * message. PDFs go through mupdf (text layer if present, page rasters when the
 * PDF is a scan); DOCX goes through mammoth's raw-text extractor.
 *
 * Format is detected by SNIFFING MAGIC BYTES, not by the blob's content type.
 * Both upload clients pin `contentType: "application/pdf"` when handing the
 * file to Vercel Blob regardless of what the user actually picked, so the
 * stored type is not evidence of anything. The bytes are.
 */

const MAX_PAGES = 8;
const MAX_CHARS = 24_000;
// Below this the CV is treated as a scan and pages are rasterized for the model.
const SCANNED_TEXT_THRESHOLD = 200;
const RASTER_TARGET_WIDTH = 1400; // px
const RASTER_MAX_PAGES = 4;
const RASTER_MAX_BYTES = 3_000_000;

export interface ExtractedCv {
  text: string;
  images: { buffer: Buffer; mediaType: "image/png" }[];
}

export type CvFormat = "pdf" | "docx" | "doc" | "unknown";

/**
 * Identify a CV by its leading bytes.
 *   PDF   → "%PDF"
 *   DOCX  → a ZIP container, "PK\x03\x04" (also PK\x05\x06 / PK\x07\x08)
 *   DOC   → OLE2 compound file, D0 CF 11 E0 — the legacy binary Word format,
 *           which mammoth cannot read. Detected so the caller can say so
 *           plainly instead of failing with a confusing ZIP parse error.
 */
export function sniffCvFormat(buffer: Buffer): CvFormat {
  if (buffer.length >= 4) {
    if (buffer.toString("latin1", 0, 4) === "%PDF") return "pdf";
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) return "docx";
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) return "doc";
  }
  return "unknown";
}

/** Thrown for a file we can identify but cannot read. Caller surfaces the message. */
export class UnsupportedCvError extends Error {}

/**
 * `textOnly` skips rasterizing a scanned PDF's pages.
 *
 * `maxChars` overrides the CV-sized text cap. An interview transcript is an
 * order of magnitude longer than a CV, and silently dropping the back half of
 * an interview yields a confident summary of half a conversation — see
 * TRANSCRIPT_MAX_CHARS in lib/recruitment/transcript.ts, which pairs this with
 * a `truncated` flag the UI actually shows.
 *
 * Triage only ever reads `.text`, so rendering up to four 1400px PNGs per
 * scanned CV is pure waste there — and across a pool of 85 it is a large
 * amount of wasted CPU inside a 300s route. The scouting pass, which actually
 * sends those images to the model, leaves it off.
 */
export async function extractCv(
  buffer: Buffer,
  opts: { textOnly?: boolean; maxChars?: number } = {},
): Promise<ExtractedCv> {
  const maxChars = opts.maxChars ?? MAX_CHARS;
  switch (sniffCvFormat(buffer)) {
    case "pdf":
      return extractPdfCv(buffer, opts.textOnly === true, maxChars);
    case "docx":
      return extractDocxCv(buffer, maxChars);
    case "doc":
      throw new UnsupportedCvError(
        "This is a legacy .doc file (Word 97–2003), which can't be read. Re-save it as .docx or PDF and upload again.",
      );
    default:
      throw new UnsupportedCvError("Unrecognised CV file — upload a PDF or a .docx.");
  }
}

async function extractDocxCv(buffer: Buffer, maxChars: number): Promise<ExtractedCv> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim().slice(0, maxChars);
  if (!text) {
    // A DOCX whose text is all inside images/text-boxes. Nothing to rasterize
    // (mammoth gives no page render), so say so rather than send an empty CV
    // to the model and get a hallucinated candidate back.
    throw new UnsupportedCvError(
      "No readable text in this .docx — if the CV is a picture inside the document, upload it as a PDF instead.",
    );
  }
  return { text, images: [] };
}

async function extractPdfCv(buffer: Buffer, textOnly: boolean, maxChars: number): Promise<ExtractedCv> {
  const mupdf: any = await import("mupdf");
  const doc = mupdf.Document.openDocument(new Uint8Array(buffer), "application/pdf");
  // Page budget scales with the char budget — a transcript PDF runs well past
  // the 8 pages that bound a CV, and capping pages here would truncate just as
  // silently as capping chars.
  const pageCap = maxChars > MAX_CHARS ? Math.ceil((maxChars / MAX_CHARS) * MAX_PAGES) : MAX_PAGES;
  const total = Math.min(doc.countPages(), pageCap);

  let text = "";
  for (let i = 0; i < total; i++) {
    const page = doc.loadPage(i);
    try {
      text += (page.toStructuredText("preserve-whitespace").asText() || "") + "\n";
    } catch {
      /* no text layer on this page */
    }
  }
  text = text.trim().slice(0, maxChars);

  const images: ExtractedCv["images"] = [];
  if (!textOnly && text.length < SCANNED_TEXT_THRESHOLD) {
    for (let i = 0; i < Math.min(total, RASTER_MAX_PAGES); i++) {
      const page = doc.loadPage(i);
      const bounds = page.getBounds();
      const ptWidth = Math.max(1, bounds[2] - bounds[0]);
      const scale = Math.min(3, Math.max(1, RASTER_TARGET_WIDTH / ptWidth));
      const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true);
      const png = Buffer.from(pix.asPNG());
      pix.destroy?.();
      if (png.length < 1024 || png.length > RASTER_MAX_BYTES) continue;
      images.push({ buffer: png, mediaType: "image/png" });
    }
  }
  return { text, images };
}
