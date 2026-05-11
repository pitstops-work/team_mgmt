import { parseBudgetExcel } from '@/lib/review/extractDocs';
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

async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
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
  return Promise.all(images.map(async (img) => {
    try {
      const blob = await put(`extracted-${Date.now()}-${img.name}`, img.buffer, { access: 'public' });
      return { ...img, blobUrl: blob.url };
    } catch (e) {
      console.warn('Blob upload failed for', img.name, (e as Error).message);
      return img;
    }
  }));
}

export async function processFileFromBuffer(
  file: { name: string; buffer: Buffer },
  asPdfDoc = false
): Promise<{ text?: TextDoc; image?: ImageDoc; pdf?: PdfDoc; budget?: string; extractedImages?: ExtractedImage[] }> {
  const buffer = file.buffer;
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    try {
      const text = await extractPdfText(buffer);
      if (text.trim().length >= 200) {
        return { text: { name: file.name, text: text.slice(0, 80000) } };
      }
    } catch {}
    if (buffer.length < 4_000_000) {
      return { pdf: { name: file.name, base64: buffer.toString('base64') } };
    }
    return { text: { name: file.name, text: `[PDF too large to embed — ${(buffer.length / 1024 / 1024).toFixed(1)} MB, text extraction yielded no usable content]` } };
  }

  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    const extractedImages = name.endsWith('.docx') ? extractImagesFromOfficeFile(buffer, file.name) : [];
    try {
      const text = await extractDocxText(buffer);
      return { text: { name: file.name, text: text.slice(0, 50000) }, extractedImages };
    } catch {
      return { text: { name: file.name, text: '[Could not extract text from Word document]' }, extractedImages };
    }
  }

  if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
    const extractedImages = name.endsWith('.pptx') ? extractImagesFromOfficeFile(buffer, file.name) : [];
    try {
      const text = await extractPptxText(buffer);
      return { text: { name: file.name, text: text.slice(0, 50000) }, extractedImages };
    } catch {
      return { text: { name: file.name, text: '[Could not extract text from PowerPoint]' }, extractedImages };
    }
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    try {
      const budget = parseBudgetExcel(buffer);
      return { budget: `=== BUDGET FILE: ${file.name} ===\n${budget.raw}` };
    } catch {
      return { text: { name: file.name, text: '[Could not parse Excel file]' } };
    }
  }

  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
    if (buffer.length > 2_000_000) return { text: { name: file.name, text: `[JPEG image — ${(buffer.length / 1024 / 1024).toFixed(1)} MB, too large to embed]` } };
    return { image: { name: file.name, mediaType: 'image/jpeg', base64: buffer.toString('base64') } };
  }
  if (name.endsWith('.png')) {
    if (buffer.length > 2_000_000) return { text: { name: file.name, text: `[PNG image — ${(buffer.length / 1024 / 1024).toFixed(1)} MB, too large to embed]` } };
    return { image: { name: file.name, mediaType: 'image/png', base64: buffer.toString('base64') } };
  }
  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: { name: file.name, text: buffer.toString('utf-8').slice(0, 20000) } };
  }

  return {};
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
}> {
  const textDocs: TextDoc[] = [];
  const imageDocs: ImageDoc[] = [];
  const pdfDocs: PdfDoc[] = [];
  const budgetParts: string[] = [];
  const extractedImages: ExtractedImage[] = [];

  await Promise.all(urls.map(async (url) => {
    const rawName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
    const name = rawName.replace(/^\d+-/, '');
    const res = await fetch(url);
    const buffer = Buffer.from(await res.arrayBuffer());
    const result = await processFileFromBuffer({ name, buffer }, asPdfDoc);
    if (result.text) textDocs.push(result.text);
    if (result.image) imageDocs.push(result.image);
    if (result.pdf) pdfDocs.push(result.pdf);
    if (result.budget) budgetParts.push(result.budget);
    if (result.extractedImages) extractedImages.push(...result.extractedImages);
  }));

  return { textDocs, imageDocs, pdfDocs, budgetParts, extractedImages };
}

const MAX_PAYLOAD_BYTES = 18_000_000;

export function buildMessageContent(
  textDocs: TextDoc[],
  imageDocs: ImageDoc[],
  pdfDocs: PdfDoc[],
  budgetParts: string[],
  uploadedImages: ExtractedImage[] = []
): any[] {
  const content: any[] = [];
  let payloadBytes = 0;

  const add = (item: any, approxBytes: number) => {
    if (payloadBytes + approxBytes > MAX_PAYLOAD_BYTES) {
      console.warn(`buildMessageContent: skipping item — payload would exceed ${MAX_PAYLOAD_BYTES / 1e6} MB`);
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
    }, pd.base64.length);
  }

  for (const img of imageDocs) {
    add({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.base64 } }, img.base64.length);
  }

  for (const img of uploadedImages) {
    if (!img.blobUrl) continue;
    const b64 = img.buffer.toString('base64');
    add({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: b64 } }, b64.length);
    add({ type: 'text', text: `[Above image is stored at: ${img.blobUrl} — use this URL in <img> tags]` }, 100);
  }

  for (const td of textDocs) {
    add({ type: 'text', text: `=== ${td.name} ===\n${td.text}` }, td.text.length);
  }

  for (const b of budgetParts) {
    add({ type: 'text', text: b }, b.length);
  }

  return content;
}
