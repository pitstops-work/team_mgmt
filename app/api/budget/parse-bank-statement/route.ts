import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
import prisma from '@/lib/prisma';
import { isSuperAdmin } from '@/lib/roleGuard';
import { put } from '@vercel/blob';

export const maxDuration = 90;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Accept both FormData (file upload) and JSON (legacy url-based)
  const contentType = req.headers.get('content-type') ?? '';
  let slotId: string;
  let fileBytes: Uint8Array;
  let fileName: string;
  let storedUrl: string | undefined;

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    slotId = formData.get('slotId') as string;
    const file = formData.get('file') as File | null;
    if (!slotId || !file) return Response.json({ error: 'slotId and file required' }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) {
      return Response.json({ error: 'PDF too large (max 15 MB). Please upload a shorter statement.' }, { status: 413 });
    }
    const ab = await file.arrayBuffer();
    fileBytes = new Uint8Array(ab);
    fileName = file.name;

    // Store to blob for record-keeping (private)
    try {
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const blob = await put(`bank-statements/${Date.now()}-${safeFileName}`, file, {
        access: 'private',
        addRandomSuffix: true,
      });
      storedUrl = blob.url;
    } catch {
      // Non-fatal: proceed without storing
    }
  } else {
    // Legacy JSON path (url + slotId)
    const body = await req.json();
    slotId = body.slotId;
    const url: string = body.url;
    if (!url || !slotId) return Response.json({ error: 'url and slotId required' }, { status: 400 });
    const pdfRes = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!pdfRes.ok) return Response.json({ error: 'Could not fetch PDF from storage' }, { status: 400 });
    const ab = await pdfRes.arrayBuffer();
    if (ab.byteLength > 15 * 1024 * 1024) {
      return Response.json({ error: 'PDF too large (max 15 MB). Please upload a shorter statement.' }, { status: 413 });
    }
    fileBytes = new Uint8Array(ab);
    fileName = url.split('/').pop() ?? 'statement.pdf';
    storedUrl = url;
  }

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

  const base64 = Buffer.from(fileBytes).toString('base64');
  const lowerName = fileName.toLowerCase();
  const mediaType: 'application/pdf' | 'image/jpeg' | 'image/png' =
    lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') ? 'image/jpeg'
    : lowerName.endsWith('.png') ? 'image/png'
    : 'application/pdf';

  const prompt = `You are extracting financial data from an Indian bank statement PDF.

Extract the following values for the statement period shown (all amounts in INR, as plain numbers without commas or symbols):

1. closingBalance — the final/closing account balance at the END of the statement period
2. interestEarned — total interest credited during this period (look for entries with "INT", "INTEREST", "INT CREDIT", "INTEREST CREDIT" in narration/description). Sum all such credits.
3. openingBalance — the opening/beginning balance at the START of the period (0 if not shown)
4. periodFrom — start date of statement period in YYYY-MM-DD format (null if not found)
5. periodTo — end date of statement period in YYYY-MM-DD format (null if not found)
6. accountHolder — name of account holder if shown (null if not found)
7. bankName — name of the bank (null if not found)
8. notes — brief note about anything unusual or uncertain in your extraction (null if all clear)

Respond ONLY with a valid JSON object. No explanation, no markdown.

Example:
{"closingBalance":245670,"interestEarned":3200,"openingBalance":180000,"periodFrom":"2024-04-01","periodTo":"2024-06-30","accountHolder":"ABC Foundation","bankName":"HDFC Bank","notes":null}`;

  const contentBlock: Anthropic.MessageParam['content'] = mediaType === 'application/pdf'
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: prompt }]
    : [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: prompt }];

  let message: Anthropic.Message;
  try {
    message = await client.messages.create(
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        messages: [{ role: 'user', content: contentBlock }],
      },
      { signal: AbortSignal.timeout(70_000) },
    );
  } catch (err: any) {
    const msg = err?.message ?? 'Claude API error';
    return Response.json({ error: msg.length > 200 ? 'Claude API error — file may be password-protected or corrupt' : msg }, { status: 502 });
  }

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
    // FD balance is no longer inferred from the statement — it is collected
    // explicitly via the FD details schedule and derived from those rows.
    create: {
      slotId,
      budgetId: slot.budgetId,
      bankStatementUrl: storedUrl,
      bankStatementParsed: { ...parsed, _parsedAt: new Date().toISOString() },
      bankBalance: parsed.closingBalance ?? 0,
      interestEarned: parsed.interestEarned ?? 0,
    },
    update: {
      bankStatementUrl: storedUrl,
      bankStatementParsed: { ...parsed, _parsedAt: new Date().toISOString() },
      bankBalance: parsed.closingBalance ?? 0,
      interestEarned: parsed.interestEarned ?? 0,
    },
  });

  return Response.json({
    bankBalance: parsed.closingBalance ?? 0,
    interestEarned: parsed.interestEarned ?? 0,
    openingBalance: parsed.openingBalance ?? null,
    periodFrom: parsed.periodFrom ?? null,
    periodTo: parsed.periodTo ?? null,
    accountHolder: parsed.accountHolder ?? null,
    bankName: parsed.bankName ?? null,
    notes: parsed.notes ?? null,
  });
}
