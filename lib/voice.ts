/**
 * lib/voice.ts
 *
 * Transcription (Groq Whisper) + translation (Google Cloud Translation v2) for voice messages.
 * Requires: GROQ_API_KEY, GOOGLE_TRANSLATE_API_KEY, BLOB_READ_WRITE_TOKEN
 */

import Groq, { toFile } from "groq-sdk";
import { put } from "@vercel/blob";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Language registry ─────────────────────────────────────────────────────────

export const SUPPORTED_LANGS = [
  { code: "en", label: "English",   native: "English"  },
  { code: "ta", label: "Tamil",     native: "தமிழ்"   },
  { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ"  },
  { code: "ml", label: "Malayalam", native: "മലയാളം"  },
  { code: "hi", label: "Hindi",     native: "हिन्दी"  },
  { code: "bn", label: "Bengali",   native: "বাংলা"   },
] as const;

export type LangCode = (typeof SUPPORTED_LANGS)[number]["code"];

const WHISPER_TO_CODE: Record<string, LangCode> = {
  english:   "en",
  tamil:     "ta",
  kannada:   "kn",
  malayalam: "ml",
  hindi:     "hi",
  bengali:   "bn",
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

// ── Transcription ─────────────────────────────────────────────────────────────

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; detectedLang: LangCode }> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
  const file = await toFile(buffer, `recording.${ext}`, { type: mimeType });

  const result = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    response_format: "verbose_json",
    // Prompt anchors Whisper to South Indian + Bengali scripts, reducing hallucination
    prompt: "Tamil, Kannada, Malayalam, Hindi, Bengali, English. Use native script.",
  }) as { text: string; language?: string };

  const detectedLang = WHISPER_TO_CODE[result.language?.toLowerCase() ?? ""] ?? "en";
  return { text: result.text.trim(), detectedLang };
}

// ── Translation ───────────────────────────────────────────────────────────────

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
