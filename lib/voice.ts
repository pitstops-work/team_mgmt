/**
 * lib/voice.ts
 *
 * Transcription (Groq Whisper) + translation (Groq LLaMA) for voice messages.
 * Requires: GROQ_API_KEY, BLOB_READ_WRITE_TOKEN
 */

import Groq from "groq-sdk";
import { createGroq } from "@ai-sdk/groq";
import { generateText } from "ai";
import { put } from "@vercel/blob";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const groqAI = createGroq({ apiKey: process.env.GROQ_API_KEY });

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

const LANG_NAMES: Record<LangCode, string> = {
  en: "English",
  ta: "Tamil",
  kn: "Kannada",
  ml: "Malayalam",
  hi: "Hindi",
  bn: "Bengali",
};

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
  const blob = await put(filename, buffer, { access: "public", contentType: mimeType });
  return blob.url;
}

// ── Transcription ─────────────────────────────────────────────────────────────

export async function transcribeAudio(
  buffer: Buffer,
  mimeType: string
): Promise<{ text: string; detectedLang: LangCode }> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
  const file = new File([buffer], `recording.${ext}`, { type: mimeType });

  const result = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    response_format: "verbose_json",
  });

  const detectedLang = WHISPER_TO_CODE[result.language?.toLowerCase() ?? ""] ?? "en";
  return { text: result.text.trim(), detectedLang };
}

// ── Translation ───────────────────────────────────────────────────────────────

export async function translateToAll(
  text: string,
  sourceLang: LangCode
): Promise<Record<LangCode, string>> {
  const targets = SUPPORTED_LANGS.filter((l) => l.code !== sourceLang);

  const results = await Promise.all(
    targets.map(async (target) => {
      const { text: translated } = await generateText({
        model: groqAI("llama-3.1-8b-instant"),
        messages: [
          {
            role: "system",
            content: `You are a translator. Translate text to ${LANG_NAMES[target.code]}. Return ONLY the translated text — no explanations, no quotes, no extra punctuation.`,
          },
          { role: "user", content: text },
        ],
      });
      return [target.code, translated.trim()] as const;
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
