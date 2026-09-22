/**
 * Which CV files the browser will accept, and what content type to upload them
 * as. Shared by the two upload surfaces (the new-desk form and add-CVs on an
 * existing desk) so the rule can't drift between them.
 *
 * Server-side, lib/recruitment/extractCv.ts sniffs the real magic bytes and is
 * the actual authority — this is the friendly front door, not the gate.
 */

export const CV_MAX_BYTES = 15 * 1024 * 1024;

export const PDF_TYPE = "application/pdf";
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TXT_TYPE = "text/plain";
/** Zoom, Google Meet and Teams all export captions as .vtt by default. */
export const VTT_TYPE = "text/vtt";

/** For an <input type="file"> accept attribute — CV intake (PDF/DOCX only). */
export const CV_ACCEPT = `${PDF_TYPE},.pdf,${DOCX_TYPE},.docx`;

/** Transcripts additionally accept the formats meeting tools actually emit. */
export const TRANSCRIPT_ACCEPT = `${CV_ACCEPT},${TXT_TYPE},.txt,${VTT_TYPE},.vtt,.srt`;

/**
 * The content type to hand Vercel Blob. Browsers leave `file.type` empty often
 * enough (especially for .docx on Windows, where it depends on which Office
 * build registered the MIME type) that the extension is the more reliable
 * signal — so decide on the extension and fall back to the browser's guess.
 */
export function cvContentType(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".docx")) return DOCX_TYPE;
  if (name.endsWith(".pdf")) return PDF_TYPE;
  return file.type || PDF_TYPE;
}

/**
 * Returns an error message, or null when the file is acceptable.
 * Rejects legacy .doc explicitly — mammoth reads only the OOXML .docx format,
 * so a .doc would upload fine and then fail during extraction.
 */
export function validateCvFile(file: File): string | null {
  const name = file.name.toLowerCase();
  const isPdf = name.endsWith(".pdf") || file.type === PDF_TYPE;
  const isDocx = name.endsWith(".docx") || file.type === DOCX_TYPE;

  if (name.endsWith(".doc") && !isDocx) {
    return `"${file.name}" is a legacy .doc (Word 97–2003), which can't be read. Re-save it as .docx or PDF.`;
  }
  if (!isPdf && !isDocx) {
    return `"${file.name}" is not a PDF or .docx — those are the supported CV formats.`;
  }
  if (file.size > CV_MAX_BYTES) {
    return `"${file.name}" is too large (max 15 MB).`;
  }
  return null;
}
