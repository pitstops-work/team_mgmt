/**
 * lib/voice.ts
 *
 * Transcription (Sarvam Saaras v3) + translation (Google Cloud Translation v2) for voice messages.
 * Requires: SARVAM_API_KEY, GOOGLE_TRANSLATE_API_KEY, BLOB_READ_WRITE_TOKEN
 */

import { put } from "@vercel/blob";
import { SUPPORTED_LANGS, type LangCode } from "./langs";

// ── Language registry ─────────────────────────────────────────────────────────

export { SUPPORTED_LANGS, type LangCode };

// BCP-47 → LangCode
const SARVAM_TO_CODE: Record<string, LangCode> = {
  "en-IN": "en",
  "ta-IN": "ta",
  "kn-IN": "kn",
  "ml-IN": "ml",
  "hi-IN": "hi",
  "bn-IN": "bn",
};

// ── Audio upload ──────────────────────────────────────────────────────────────

export async function uploadAudio(
  buffer: Buffer,
  mimeType: string,
  threadId: string
): Promise<string> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
  const filename = `voice/${threadId}/${Date.now()}.${ext}`;
  const blob = await put(filename, buffer, { access: "private", contentType: mimeType });
  return blob.url;
}

// ── Transcription (Sarvam Saaras v3) ─────────────────────────────────────────

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; detectedLang: LangCode }> {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) throw new Error("SARVAM_API_KEY is not set");

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";

  const form = new FormData();
  const arrayBuf = Buffer.from(buffer).buffer as ArrayBuffer;
  form.append("file", new Blob([arrayBuf], { type: mimeType }), `recording.${ext}`);
  form.append("model", "saaras:v3");
  form.append("language_code", "unknown"); // auto-detect
  form.append("mode", "codemix");          // handles Tamil-English, Hindi-English etc.

  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: { "api-subscription-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sarvam STT error: ${err}`);
  }

  const data = await res.json() as { transcript: string; language_code: string };
  const detectedLang = SARVAM_TO_CODE[data.language_code] ?? "en";
  return { text: data.transcript.trim(), detectedLang };
}

// ── Translation (Google Cloud Translation v2) ─────────────────────────────────

export async function translateToAll(
  text: string,
  sourceLang: LangCode
): Promise<Record<LangCode, string>> {
  const targets = SUPPORTED_LANGS.filter((l) => l.code !== sourceLang);
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;

  if (!apiKey) throw new Error("GOOGLE_TRANSLATE_API_KEY is not set");

  const results = await Promise.all(
    targets.map(async (target) => {
      const res = await fetch(
        `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: text,
            source: sourceLang,
            target: target.code,
            format: "text",
          }),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Google Translate error for ${target.code}: ${err}`);
      }
      const data = await res.json();
      const translated: string = data.data?.translations?.[0]?.translatedText ?? text;
      return [target.code, translated] as const;
    })
  );

  return {
    [sourceLang]: text,
    ...Object.fromEntries(results),
  } as Record<LangCode, string>;
}

// ── Display resolver ──────────────────────────────────────────────────────────

export function resolveDisplayText(
  body: string,
  originalLang: string,
  translations: Record<string, string> | null | undefined,
  viewerLang: string
): { displayText: string; isTranslated: boolean } {
  if (originalLang === viewerLang || !translations) {
    return { displayText: body, isTranslated: false };
  }
  const t = translations[viewerLang];
  return t
    ? { displayText: t, isTranslated: true }
    : { displayText: body, isTranslated: false };
}
