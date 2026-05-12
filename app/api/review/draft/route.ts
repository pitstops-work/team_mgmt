import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { del } from '@vercel/blob';
import { parseBudgetExcel } from '@/lib/review/extractDocs';
import { buildSystemPrompt, buildPromptForDocType, DEFAULT_LANGUAGE_RULES } from '@/lib/review/rulebook';
import { sql } from '@/lib/review/db';

export const runtime = 'nodejs';
export const maxDuration = 120;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

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

type TextDoc = { name: string; text: string };
type ImageDoc = { name: string; mediaType: 'image/jpeg' | 'image/png'; base64: string };
type PdfDoc = { name: string; base64: string };

async function processFile(file: { name: string; buffer: Buffer }): Promise<{ text?: TextDoc; image?: ImageDoc; pdf?: PdfDoc; budget?: string }> {
  const buffer = file.buffer;
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    try {
      const text = await extractPdfText(buffer);
      const isBlank = text.trim().length < 100;
      if (!isBlank) {
        return { text: { name: file.name, text: text.slice(0, 50000) } };
      }
      // Scanned PDF — send directly to Claude as a document block
      return { pdf: { name: file.name, base64: buffer.toString('base64') } };
    } catch (e: any) {
      console.error('PDF extraction error:', e.message);
      // Fall back to sending scanned PDF directly to Claude
      return { pdf: { name: file.name, base64: buffer.toString('base64') } };
    }
  }

  if (name.endsWith('.docx') || name.endsWith('.doc')) {
    try {
      const text = await extractDocxText(buffer);
      return { text: { name: file.name, text: text.slice(0, 50000) } };
    } catch {
      return { text: { name: file.name, text: '[Could not extract text from Word document]' } };
    }
  }

  if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
    try {
      const text = await extractPptxText(buffer);
      return { text: { name: file.name, text: text.slice(0, 50000) } };
    } catch {
      return { text: { name: file.name, text: '[Could not extract text from PowerPoint]' } };
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
    return { image: { name: file.name, mediaType: 'image/jpeg', base64: buffer.toString('base64') } };
  }

  if (name.endsWith('.png')) {
    return { image: { name: file.name, mediaType: 'image/png', base64: buffer.toString('base64') } };
  }

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return { text: { name: file.name, text: buffer.toString('utf-8').slice(0, 20000) } };
  }

  return {};
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const meta = {
      meeting: formData.get('meeting') as string || '',
      orgName: formData.get('orgName') as string || '',
      orgCity: formData.get('orgCity') as string || '',
      theme: formData.get('theme') as string || '',
      geography: formData.get('geography') as string || '',
      presentedBy: formData.get('presentedBy') as string || '',
      visitedBy: formData.get('visitedBy') as string || '',
      progVisitDate: formData.get('progVisitDate') as string || '',
      finVisitDate: formData.get('finVisitDate') as string || '',
      grmDate: formData.get('grmDate') as string || '',
      delayRationale: formData.get('delayRationale') as string || 'NA',
      grantNumber: formData.get('grantNumber') as string || '1st',
      grantAmount: formData.get('grantAmount') as string || '',
      grantDuration: formData.get('grantDuration') as string || '',
      beneficiaryCount: formData.get('beneficiaryCount') as string || '',
      staffNotes: formData.get('staffNotes') as string || '',
      isRenewal: formData.get('isRenewal') === 'true',
      docType: formData.get('docType') as string || 'grant_note',
      // Programme Design fields
      programmeName: formData.get('programmeName') as string || '',
      vendors: formData.get('vendors') as string || '',
      scale: formData.get('scale') as string || '',
      hasPilot: formData.get('hasPilot') === 'true',
      pilotNotes: formData.get('pilotNotes') as string || '',
    };

    // ── Structured inputs ──────────────────────────────────────────────────────

    const orgCompliance = {
      registrationType:       formData.get('org_registrationType') as string || '',
      yearOfRegistration:     formData.get('org_yearOfRegistration') as string || '',
      taxStatus12a:           formData.get('org_taxStatus12a') as string || '',
      taxStatus80g:           formData.get('org_taxStatus80g') as string || '',
      fcraStatus:             formData.get('org_fcraStatus') as string || '',
      fcraValidTill:          formData.get('org_fcraValidTill') as string || '',
      boardSize:              formData.get('org_boardSize') as string || '',
      booksLocation:          formData.get('org_booksLocation') as string || '',
      accountingSoftware:     formData.get('org_accountingSoftware') as string || '',
      pendingItNotices:       formData.get('org_pendingItNotices') as string || '',
      pendingItNoticesDetails:formData.get('org_pendingItNoticesDetails') as string || '',
      governanceNotes:        formData.get('org_governanceNotes') as string || '',
    };

    type FRow = { donor: string; grantType: string; di: string; fy2223: string; fy2324: string; fy2425: string; fy2526: string; fy2627: string; };
    type ERow = { fy: string; salary: string; programme: string; admin: string; capital: string; };
    type TRow = { designation: string; fte: string; monthlySalary: string; };

    const fundingRows: FRow[] = (() => { try { return JSON.parse(formData.get('fundingRows') as string || '[]'); } catch { return []; } })();
    const expenditureRows: ERow[] = (() => { try { return JSON.parse(formData.get('expenditureRows') as string || '[]'); } catch { return []; } })();
    const teamRows: TRow[] = (() => { try { return JSON.parse(formData.get('teamRows') as string || '[]'); } catch { return []; } })();
    const statutoryNotes = formData.get('statutoryNotes') as string || '';

    const pddContext      = formData.get('pddContext') as string || '';
    const pddGoal         = formData.get('pddGoal') as string || '';
    const pddHistory      = formData.get('pddHistory') as string || '';
    const pddEffects: string[]       = (() => { try { return JSON.parse(formData.get('pddEffects') as string || '[]'); } catch { return []; } })();
    const pddInterventions: string[] = (() => { try { return JSON.parse(formData.get('pddInterventions') as string || '[]'); } catch { return []; } })();
    const pddPeople       = formData.get('pddPeople') as string || '';

    // ── Block builders ─────────────────────────────────────────────────────────

    function buildOrgBlock(): string {
      const c = orgCompliance;
      const lines: string[] = [];
      if (c.registrationType) lines.push(`Registered as: ${c.registrationType}${c.yearOfRegistration ? ` (${c.yearOfRegistration})` : ''}`);
      if (c.taxStatus12a) lines.push(`12A: ${c.taxStatus12a}`);
      if (c.taxStatus80g) lines.push(`80G: ${c.taxStatus80g}`);
      if (c.fcraStatus) {
        const fcra = c.fcraStatus === 'Registered' && c.fcraValidTill
          ? `Registered (valid till ${c.fcraValidTill})` : c.fcraStatus;
        lines.push(`FCRA: ${fcra}`);
      }
      if (c.boardSize) lines.push(`Governing board: ${c.boardSize} members`);
      if (c.booksLocation) lines.push(`Books of accounts: ${c.booksLocation}${c.accountingSoftware ? ` — ${c.accountingSoftware}` : ''}`);
      if (c.pendingItNotices === 'Yes') lines.push(`Pending IT notices: Yes — ${c.pendingItNoticesDetails || 'details not provided'}`);
      else if (c.pendingItNotices === 'No') lines.push('Pending IT notices: None');
      if (c.governanceNotes) lines.push(`Governance: ${c.governanceNotes}`);
      return lines.length ? `ORGANISATION & COMPLIANCE:\n${lines.join('\n')}` : '';
    }

    function buildFinanceBlock(): string {
      const parts: string[] = [];
      const fmt = (v: string) => v ? `₹${v}L` : '—';

      if (fundingRows.length) {
        parts.push('FUNDING SOURCES (₹ Lakhs):');
        parts.push('| Donor | Type | D/I | FY22-23 | FY23-24 | FY24-25 | FY25-26 | FY26-27 (committed) |');
        parts.push('|---|---|---|---|---|---|---|---|');
        for (const r of fundingRows) {
          parts.push(`| ${r.donor} | ${r.grantType || '—'} | ${r.di || '—'} | ${fmt(r.fy2223)} | ${fmt(r.fy2324)} | ${fmt(r.fy2425)} | ${fmt(r.fy2526)} | ${fmt(r.fy2627)} |`);
        }
      }

      if (expenditureRows.length) {
        parts.push('\nEXPENDITURE HISTORY (₹ Lakhs, excl. depreciation):');
        parts.push('| FY | Salary | Programme | Admin | Capital | Total |');
        parts.push('|---|---|---|---|---|---|');
        const opexValues: number[] = [];
        for (const r of expenditureRows) {
          const sal = parseFloat(r.salary) || 0;
          const prog = parseFloat(r.programme) || 0;
          const adm = parseFloat(r.admin) || 0;
          const cap = parseFloat(r.capital) || 0;
          const total = sal + prog + adm + cap;
          opexValues.push(sal + prog + adm);
          parts.push(`| ${r.fy} | ${fmt(r.salary)} | ${fmt(r.programme)} | ${fmt(r.admin)} | ${fmt(r.capital)} | ₹${total.toFixed(1)}L |`);
        }
        if (opexValues.length) {
          const avg = opexValues.reduce((a, b) => a + b, 0) / opexValues.length;
          parts.push(`Average annual opex (excl. capital): ₹${avg.toFixed(1)}L`);
        }
      }

      if (teamRows.length) {
        parts.push('\nPROPOSED TEAM (this grant):');
        parts.push('| Designation | FTE% | Monthly ₹ | Annual cost |');
        parts.push('|---|---|---|---|');
        for (const r of teamRows) {
          const annual = r.monthlySalary ? `₹${(parseFloat(r.monthlySalary) * 12 / 100000).toFixed(2)}L/yr` : '—';
          parts.push(`| ${r.designation} | ${r.fte || '100'}% | ₹${r.monthlySalary || '—'}/mo | ${annual} |`);
        }
      }

      if (statutoryNotes) parts.push(`\nSTATUTORY COMPLIANCE: ${statutoryNotes}`);

      return parts.length ? parts.join('\n') : '';
    }

    function buildPddBlock(): string {
      const parts: string[] = [];
      if (pddContext)      parts.push(`Context:\n${pddContext}`);
      if (pddGoal)         parts.push(`Goal:\n${pddGoal}`);
      if (pddHistory)      parts.push(`Programme history:\n${pddHistory}`);
      if (pddEffects.length) {
        parts.push('Effects:');
        pddEffects.forEach(e => parts.push(`- ${e}`));
      }
      if (pddInterventions.length) {
        parts.push('Key interventions:');
        pddInterventions.forEach(i => parts.push(`- ${i}`));
      }
      if (pddPeople) parts.push(`People involved:\n${pddPeople}`);
      return parts.length ? `PROGRAMME DESIGN:\n${parts.join('\n\n')}` : '';
    }

    const structuredBlocks = [buildOrgBlock(), buildFinanceBlock(), buildPddBlock()].filter(Boolean).join('\n\n');

    // Download and process files from Vercel Blob URLs
    const blobUrlsRaw = formData.get('blobUrls') as string;
    const blobUrls: string[] = blobUrlsRaw ? JSON.parse(blobUrlsRaw) : [];
    const textDocs: TextDoc[] = [];
    const imageDocs: ImageDoc[] = [];
    const pdfDocs: PdfDoc[] = [];
    const budgetParts: string[] = [];

    await Promise.all(blobUrls.map(async (url) => {
      const rawName = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
      const name = rawName.replace(/^\d+-/, '');
      const res = await fetch(url);
      const buffer = Buffer.from(await res.arrayBuffer());
      const result = await processFile({ name, buffer });
      if (result.text) textDocs.push(result.text);
      if (result.image) imageDocs.push(result.image);
      if (result.pdf) pdfDocs.push(result.pdf);
      if (result.budget) budgetParts.push(result.budget);
    }));

    // Build the text portion of the message
    const metaBlock = meta.docType === 'programme_design'
      ? `PROGRAMME DESIGN METADATA:
Meeting: ${meta.meeting}
Programme / concept name: ${meta.programmeName || '[not specified]'}
Implementation partner: ${meta.orgName}, ${meta.orgCity}
Key vendors / partners: ${meta.vendors || '[not specified]'}
Theme: ${meta.theme}
Geography: ${meta.geography}
Presented by: ${meta.presentedBy}
Visited by: ${meta.visitedBy}
Programme visit date: ${meta.progVisitDate}
Finance visit date: ${meta.finVisitDate}
GRM/Debrief date: ${meta.grmDate}
Rationale for delay: ${meta.delayRationale}
Grant amount: ${meta.grantAmount}
Grant duration: ${meta.grantDuration} years
Scale / daily target: ${meta.scale || '[not specified]'}
Prior pilot: ${meta.hasPilot ? `Yes — ${meta.pilotNotes || 'no notes provided'}` : 'No'}`
      : `GRANT NOTE METADATA:
Meeting: ${meta.meeting}
Organisation: ${meta.orgName}, ${meta.orgCity}
Theme: ${meta.theme}
Geography of work: ${meta.geography}
Presented by: ${meta.presentedBy}
Visited by: ${meta.visitedBy}
Programme team visit date: ${meta.progVisitDate}
Finance team visit date: ${meta.finVisitDate}
GRM/Debrief date: ${meta.grmDate}
Rationale for delay: ${meta.delayRationale}
Grant number: ${meta.grantNumber}
Grant amount: ${meta.grantAmount}
Grant duration: ${meta.grantDuration} years
Beneficiary count: ${meta.beneficiaryCount || '[not specified]'}
Renewal: ${meta.isRenewal ? 'Yes — include "Our experience from the previous grant" section' : 'No'}`;

    const staffNotesBlock = meta.docType === 'programme_design'
      ? `OUR SENSE OF THEIR CAPACITY (staff notes — use as basis for "Our sense of their capacity" section):
${meta.staffNotes || '[Not provided]'}`
      : `OUR SENSE OF THE ORG (staff notes — use as basis for "Our sense of their work" paragraph):
${meta.staffNotes || '[Not provided]'}`;

    const docsBlock = textDocs.length > 0
      ? `UPLOADED DOCUMENTS:\n\n${textDocs.map(d => `=== ${d.name} ===\n${d.text}`).join('\n\n')}`
      : 'UPLOADED DOCUMENTS: [None provided]';

    const budgetBlock = budgetParts.length > 0 ? budgetParts.join('\n\n') : 'BUDGET FILE: [Not provided]';

    const imageNote = imageDocs.length > 0
      ? `\nIMAGES PROVIDED: ${imageDocs.map(i => i.name).join(', ')} — read these carefully for financial data, tables, org charts, or other relevant information.`
      : '';

    const pdfNote = pdfDocs.length > 0
      ? `\nSCANNED PDFs (sent as documents for visual reading): ${pdfDocs.map(p => p.name).join(', ')} — read financial figures directly from these.`
      : '';

    const textContent = `${metaBlock}

${staffNotesBlock}
${structuredBlocks ? `\n${structuredBlocks}\n` : ''}
${docsBlock}

${budgetBlock}${imageNote}${pdfNote}

${meta.docType === 'programme_design'
  ? 'Draft the complete internal programme design note now. Follow the template structure exactly. Where a figure or fact is not in the documents, write "[to be filled]" in that field only — do not add any commentary, summary of gaps, or readiness assessment.'
  : 'Draft the complete internal grant approval note now. Follow the template structure exactly. Show the opex calculation working. Where a figure or fact is not in the documents, write "[to be filled]" in that field only — do not add any commentary, summary of gaps, or readiness assessment anywhere in the note.'
}`;

    // Build message content — text block, then scanned PDFs as document blocks, then images
    const content: Anthropic.MessageParam['content'] = [
      { type: 'text', text: textContent },
      ...pdfDocs.map(pdf => ({
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: pdf.base64,
        },
        title: pdf.name,
      })),
      ...imageDocs.map(img => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: img.mediaType,
          data: img.base64,
        },
      })),
    ];

    // Load rulebook overrides + doc type config from DB in parallel
    const [rulebookRows, docTypeRows] = await Promise.all([
      sql`SELECT section, content FROM rulebook_rules`,
      sql`SELECT key, label, template_rules, export_mode, apply_financial_rules FROM doc_types WHERE key = ${meta.docType}`,
    ]);
    const overrides: Record<string, string> = {};
    for (const r of rulebookRows) overrides[r.section as string] = r.content as string;
    const docTypeRow = docTypeRows[0] as any;
    const systemPrompt = docTypeRow
      ? buildPromptForDocType(docTypeRow, overrides, meta.docType)
      : buildSystemPrompt(overrides);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = client.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 16000,
            system: systemPrompt,
            messages: [{ role: 'user', content }],
          });

          for await (const event of anthropicStream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
        } catch (err: any) {
          controller.enqueue(encoder.encode(`\n\n[ERROR: ${err.message}]`));
        } finally {
          controller.close();
          if (blobUrls.length > 0) {
            await del(blobUrls).catch(() => {});
          }
        }
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });

  } catch (err: any) {
    console.error('Draft error:', err);
    return NextResponse.json({ error: err.message || 'Generation failed' }, { status: 500 });
  }
}
