import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/roleGuard';

export const maxDuration = 60;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { url, slotId } = await req.json();
  if (!url || !slotId) return Response.json({ error: 'url and slotId required' }, { status: 400 });

  // Verify access
  const slot = await prisma.budgetReportSlot.findUnique({
    where: { id: slotId },
    select: { budgetId: true },
  });
  if (!slot) return Response.json({ error: 'Not found' }, { status: 404 });

  const budget = await prisma.budget.findUnique({
    where: { id: slot.budgetId },
    select: { partnerId: true },
  });
  if (!budget) return Response.json({ error: 'Not found' }, { status: 404 });
  if (budget.partnerId !== session.user.id && !isSuperAdmin(session)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the PDF as base64
  const pdfRes = await fetch(url);
  if (!pdfRes.ok) return Response.json({ error: 'Could not fetch PDF' }, { status: 400 });
  const arrayBuffer = await pdfRes.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mediaType = (pdfRes.headers.get('content-type') ?? 'application/pdf') as 'application/pdf' | 'image/jpeg' | 'image/png';

  const prompt = `You are extracting financial data from an Indian bank statement PDF.

Extract the following values for the statement period shown (all amounts in INR, as plain numbers without commas or symbols):

1. closingBalance — the final/closing account balance at the END of the statement period
2. interestEarned — total interest credited during this period (look for entries with "INT", "INTEREST", "INT CREDIT", "INTEREST CREDIT" in narration/description). Sum all such credits.
3. fdBalance — total fixed deposit balance if shown anywhere in the statement (0 if not present)
4. openingBalance — the opening/beginning balance at the START of the period (0 if not shown)
5. periodFrom — start date of statement period in YYYY-MM-DD format (null if not found)
6. periodTo — end date of statement period in YYYY-MM-DD format (null if not found)
7. accountHolder — name of account holder if shown (null if not found)
8. bankName — name of the bank (null if not found)
9. notes — brief note about anything unusual or uncertain in your extraction (null if all clear)

Respond ONLY with a valid JSON object. No explanation, no markdown.

Example:
{"closingBalance":245670,"interestEarned":3200,"fdBalance":0,"openingBalance":180000,"periodFrom":"2024-04-01","periodTo":"2024-06-30","accountHolder":"ABC Foundation","bankName":"HDFC Bank","notes":null}`;

  const contentBlock: Anthropic.MessageParam['content'] = mediaType === 'application/pdf'
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: prompt }]
    : [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: prompt }];

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: contentBlock }],
  });

  const rawText = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

  let parsed: Record<string, any> = {};
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    return Response.json({ error: 'Claude could not parse the statement', raw: rawText }, { status: 422 });
  }

  // Persist the parsed result against the report
  await prisma.budgetReport.upsert({
    where: { slotId },
    create: {
      slotId,
      budgetId: slot.budgetId,
      bankStatementUrl: url,
      bankStatementParsed: { ...parsed, _parsedAt: new Date().toISOString() },
      bankBalance: parsed.closingBalance ?? 0,
      interestEarned: parsed.interestEarned ?? 0,
      fdBalance: parsed.fdBalance ?? 0,
    },
    update: {
      bankStatementUrl: url,
      bankStatementParsed: { ...parsed, _parsedAt: new Date().toISOString() },
      bankBalance: parsed.closingBalance ?? 0,
      interestEarned: parsed.interestEarned ?? 0,
      fdBalance: parsed.fdBalance ?? 0,
    },
  });

  return Response.json({
    bankBalance: parsed.closingBalance ?? 0,
    interestEarned: parsed.interestEarned ?? 0,
    fdBalance: parsed.fdBalance ?? 0,
    openingBalance: parsed.openingBalance ?? null,
    periodFrom: parsed.periodFrom ?? null,
    periodTo: parsed.periodTo ?? null,
    accountHolder: parsed.accountHolder ?? null,
    bankName: parsed.bankName ?? null,
    notes: parsed.notes ?? null,
  });
}
