// Wiki translation pipeline. Uses Claude to translate a page's canonical
// markdown into every other supported language, preserving markdown structure
// and transliterating scheme / government / place names rather than translating
// them.
//
// Trigger model: best-effort cron (/api/cron/wiki-translate) finds pages where
// the canonical content has been edited since the last translation timestamp
// and re-translates them. Not invoked synchronously from the request path
// because a full 5-language pass can take a minute or two.

import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";

const ALL_LANGS = ["en", "ta", "kn", "ml", "hi", "bn"] as const;

const LANG_NAMES: Record<string, string> = {
  en: "English",
  ta: "Tamil",
  kn: "Kannada",
  ml: "Malayalam",
  hi: "Hindi",
  bn: "Bengali",
};

export type TranslationEntry = {
  content: string;
  translatedAt: string;
  machineTranslated: boolean;
};

export type TranslationMap = Record<string, TranslationEntry>;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function translateMarkdown(
  client: Anthropic,
  content: string,
  fromLang: string,
  toLang: string,
): Promise<string> {
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `Translate the following ${LANG_NAMES[fromLang] ?? fromLang} markdown to ${LANG_NAMES[toLang] ?? toLang}.

Critical rules:
- Preserve ALL markdown structure exactly: headings (#, ##, ###), lists, links, bold, italics, code blocks, tables.
- For these terms, transliterate (write in the target script but keep the term recognisable) rather than translate:
  - Scheme / programme names (e.g. PM-KISAN, ICDS, Ujjwala, MGNREGA, PMAY)
  - Government office / agency names (e.g. BBMP, Anganwadi, NRC, Tahsildar, BDO)
  - Document / form names (e.g. Aadhaar, ration card, NOC, EWS certificate)
  - Place names
  - Acronyms used as proper nouns
- Translate plain descriptive language naturally — don't be overly literal.
- Return ONLY the translated markdown. No preamble, commentary, or surrounding fences.

Source markdown:
${content}`,
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return text.trim();
}

/**
 * Translate the canonical content of a single page into every other supported
 * language. Returns the count of successful translations.
 */
export async function translatePage(pageId: string): Promise<{ translated: number; skipped: number; failed: number }> {
  const client = getClient();
  if (!client) {
    return { translated: 0, skipped: 0, failed: 0 };
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id: pageId },
    select: {
      canonicalLang: true,
      canonicalContent: true,
      translatedContent: true,
    },
  });
  if (!page || !page.canonicalContent.trim()) {
    return { translated: 0, skipped: 0, failed: 0 };
  }

  const current = (page.translatedContent as TranslationMap | null) ?? {};
  const updated: TranslationMap = { ...current };
  const targets = ALL_LANGS.filter((l) => l !== page.canonicalLang);

  let translated = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      const md = await translateMarkdown(client, page.canonicalContent, page.canonicalLang, target);
      updated[target] = {
        content: md,
        translatedAt: new Date().toISOString(),
        machineTranslated: true,
      };
      translated++;
    } catch (err) {
      console.error(`[wiki translate] page=${pageId} target=${target} failed`, err);
      failed++;
    }
  }

  await prisma.wikiPage.update({
    where: { id: pageId },
    data: { translatedContent: updated },
  });

  return { translated, skipped: 0, failed };
}

/**
 * Find pages whose canonical content has been edited since their translations
 * were last generated. Used by the cron to drive incremental retranslation.
 */
export async function findPagesNeedingTranslation(limit = 5): Promise<{ id: string }[]> {
  // Raw query: stale = page has been edited after the most recent translation
  // timestamp, OR has no translations at all but has non-empty canonical content.
  const rows: { id: string }[] = await prisma.$queryRaw`
    SELECT id FROM "WikiPage"
    WHERE "archivedAt" IS NULL
      AND "status" != 'retired'
      AND length("canonicalContent") > 20
      AND (
        "translatedContent"::text = '{}'::text
        OR EXISTS (
          SELECT 1
          FROM jsonb_each("translatedContent") AS t
          WHERE (t.value->>'translatedAt')::timestamp < "lastEditedAt"
        )
        OR NOT EXISTS (
          SELECT 1 FROM jsonb_each("translatedContent")
        )
      )
    ORDER BY "lastEditedAt" DESC
    LIMIT ${limit}
  `;
  return rows;
}
