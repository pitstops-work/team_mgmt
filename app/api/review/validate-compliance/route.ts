import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  const { docUrl, checkTitle, questions, responses } = await req.json();

  if (!docUrl || !checkTitle || !questions?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Fetch the document bytes
  let docBase64: string;
  let mediaType: string;
  try {
    const docRes = await fetch(docUrl);
    if (!docRes.ok) throw new Error(`Fetch failed: ${docRes.status}`);
    const buf = await docRes.arrayBuffer();
    docBase64 = Buffer.from(buf).toString('base64');
    const ct = docRes.headers.get('content-type') ?? '';
    mediaType = ct.startsWith('image/') ? ct : 'application/pdf';
  } catch (err: any) {
    return NextResponse.json({ error: `Could not fetch document: ${err.message}` }, { status: 400 });
  }

  const qaPairs = questions.map((q: string, i: number) => {
    const r = responses[i] || 'not answered';
    return `Q${i + 1}: ${q}\nPartner response: ${r}`;
  }).join('\n\n');

  const prompt = `You are reviewing a compliance document for an NGO grant due diligence process.

Compliance check: ${checkTitle}

Partner responses to the checklist questions:
${qaPairs}

Read the attached document carefully. Assess whether the document:
1. Matches or supports the partner's stated responses
2. Contains the key information expected for this compliance check
3. Has any issues, gaps, or inconsistencies with what was claimed

Respond ONLY with a JSON object in this exact format (no markdown, no prose outside the JSON):
{
  "status": "pass" | "fail" | "partial",
  "summary": "One concise sentence describing the finding",
  "flags": ["Flag 1 if any issue", "Flag 2 if any issue"]
}

"pass" = document supports the responses and is in order
"partial" = document is relevant but incomplete or partially matches
"fail" = document contradicts the responses, is wrong document, or is missing critical information

Keep flags to actual issues only. Empty array if no flags.`;

  try {
    const isImage = mediaType.startsWith('image/');
    const docContent: Anthropic.MessageParam['content'] = isImage
      ? [
          { type: 'image', source: { type: 'base64', media_type: mediaType as 'image/jpeg' | 'image/png', data: docBase64 } },
          { type: 'text', text: prompt },
        ]
      : [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: docBase64 } } as any,
          { type: 'text', text: prompt },
        ];

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: docContent }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();
    // Strip any markdown fences if present
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const result = JSON.parse(jsonStr);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { status: 'partial', summary: 'Could not parse validation result', flags: [err.message] },
      { status: 200 },
    );
  }
}
