/**
 * lib/voice.ts
 *
 * Transcription (Groq Whisper) + translation (Claude Haiku) for voice messages.
 * Requires: GROQ_API_KEY, ANTHROPIC_API_KEY, BLOB_READ_WRITE_TOKEN (Vercel Blob)
 */

import Groq from "groq-sdk";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { put } from "@vercel/blob";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ── Language registry ─────────────────────────────────────────────────────────

export const SUPPORTED_LANGS = [
  { code: "en", label: "English",   native: "English",  whisper: "english"   },
  { code: "ta", label: "Tamil",     native: "தமிழ்",   whisper: "tamil"     },
  { code: "kn", label: "Kannada",   native: "ಕನ್ನಡ",  whisper: "kannada"   },
  { code: "ml", label: "Malayalam", native: "മലയാളം",  whisper: "malayalam" },
  { code: "hi", label: "Hindi",     native: "हिन्दी",  whisper: "hindi"     },
  { code: "bn", label: "Bengali",   native: "বাংলা",   whisper: "bengali"   },
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

/**
 * Upload raw audio bytes to Vercel Blob.
 * Returns a permanent public URL.
 */
export async function uploadAudio(
  buffer: Buffer,
  mimeType: string,
  threadId: string
): Promise<string> {
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
  const filename = `voice/${threadId}/${Date.now()}.${ext}`;
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
  });
  return blob.url;
}

// ── Transcription ─────────────────────────────────────────────────────────────

/**
 * Transcribe audio with Groq Whisper.
 * Returns the transcript text and detected language code.
 */
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

/**
 * Translate text into all supported languages except the source language.
 * Runs in parallel. Returns a full translations map including the original.
 *
 * Example: translateToAll("Hello", "en")
 *   → { en: "Hello", ta: "வணக்கம்", kn: "ನಮಸ್ಕಾರ", ml: "ഹലോ", hi: "नमस्ते", bn: "হ্যালো" }
 */
export async function translateToAll(
  text: string,
  sourceLang: LangCode
): Promise<Record<LangCode, string>> {
  const targets = SUPPORTED_LANGS.filter((l) => l.code !== sourceLang);

  const results = await Promise.all(
    targets.map(async (target) => {
      const { text: translated } = await generateText({
        model: anthropic("claude-haiku-4-5-20251001"),
        messages: [
          {
            role: "user",
            content:
              `Translate the following text to ${LANG_NAMES[target.code]}. ` +
              `Return ONLY the translated text. No explanations, no quotes.\n\n${text}`,
          },
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

/**
 * Given a message's body, originalLang and stored translations,
 * return the text the viewer should see and whether it's a translation.
 */
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
