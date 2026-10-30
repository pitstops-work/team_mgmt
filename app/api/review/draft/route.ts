import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { downloadAndProcess, uploadImagesToBlob } from '@/lib/review/processFiles';
import type { ImageDoc } from '@/lib/review/processFiles';
import { buildSystemPromptFromCaps } from '@/lib/review/rulebook';
import { sql } from '@/lib/review/db';

export const runtime = 'nodejs';
// Matches the orchestrator routes. A full note at high effort does not finish
// inside 120s, and the old ceiling cut the stream off mid-document.
export const maxDuration = 300;

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Document extraction lives in lib/review/processFiles.ts and is shared with the
// orchestrator. This route used to carry its own copy, which silently drifted:
// it truncated every document at 50,000 characters and flattened Word tables.

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

    // Pull due diligence data from DB if orgId provided
    const ddOrgId = formData.get('ddOrgId') as string || '';
    let dd: any = null;
    if (ddOrgId) {
      try {
        const rows = await sql`
          SELECT org_profile, governing_body, compliance_check, statutory_filings,
                 salary_details, funding_income, expenditure, pdd
          FROM org_due_diligence WHERE org_id = ${ddOrgId}
        `;
        if (rows[0]) dd = rows[0];
      } catch { /* non-fatal */ }
    }

    const orgProfile   = dd?.org_profile   || {};
    const govBody      = dd?.governing_body || [];
    const compCheck    = dd?.compliance_check || {};
    const salaryData   = dd?.salary_details || {};
    const fundingData  = dd?.funding_income || {};
    const expData      = dd?.expenditure    || {};
    const pddData      = dd?.pdd            || {};

    // ── Block builders (from DD record) ───────────────────────────────────────

    function buildOrgBlock(): string {
      const lines: string[] = [];
      if (orgProfile.registrationType) lines.push(`Registered as: ${orgProfile.registrationType}${orgProfile.registrationDate ? ` — reg. ${orgProfile.registrationDate}` : ''}`);
      if (orgProfile.panNumber) lines.push(`PAN: ${orgProfile.panNumber}`);
      const comp = compCheck?.mandatory || {};
      if (comp['12a-80g']?.responses?.[0]) lines.push(`12A/80G: ${comp['12a-80g'].responses[0]}`);
      if (comp['fcra']?.responses?.[0]) lines.push(`FCRA: ${comp['fcra'].responses[0]}`);
      if (govBody.length) lines.push(`Governing board: ${govBody.length} members`);
      if (orgProfile.booksAddress) lines.push(`Books of accounts maintained at: ${orgProfile.booksAddress}`);
      const rec = compCheck?.recommended || {};
      if (rec['governance']?.responses?.[0]) lines.push(`Governance: ${rec['governance'].responses[0]}`);
      if (rec['books']?.responses?.[0]) lines.push(`Accounts: ${rec['books'].responses[0]}`);
      return lines.length ? `ORGANISATION & COMPLIANCE:\n${lines.join('\n')}` : '';
    }

    function buildFinanceBlock(): string {
      const parts: string[] = [];
      const funders: any[] = fundingData.sectionA || [];
      if (funders.length) {
        parts.push('FUNDING SOURCES:');
        parts.push('| Funder | Type | Purpose | Start | FY22-23 | FY23-24 | FY24-25 | FY25-26 | FY26-27 |');
        parts.push('|---|---|---|---|---|---|---|---|---|');
        for (const r of funders) {
          const fmt = (v: string) => v ? `₹${v}` : '—';
          parts.push(`| ${r.funderName} | ${r.funderType || '—'} | ${r.purpose || '—'} | ${r.startDate || '—'} | ${fmt(r.fy2223)} | ${fmt(r.fy2324)} | ${fmt(r.fy2425)} | ${fmt(r.fy2526)} | ${fmt(r.fy2627)} |`);
        }
      }
      const overall = expData.overall || {};
      const expRows = ['Salary Expenses', 'Programme Expenses', 'Admin Expenses', 'Capital (Construction/Renovation)'];
      const hasExp = expRows.some(r => overall[r]?.fy2425 || overall[r]?.fy2526);
      if (hasExp) {
        parts.push('\nEXPENDITURE (₹):');
        parts.push('| Item | FY22-23 | FY23-24 | FY24-25 | FY25-26 |');
        parts.push('|---|---|---|---|---|');
        for (const r of expRows) {
          const d = overall[r] || {};
          parts.push(`| ${r} | ${d.fy2223 || '—'} | ${d.fy2324 || '—'} | ${d.fy2425 || '—'} | ${d.fy2526 || '—'} |`);
        }
      }
      const proposed: any[] = salaryData.table2 || [];
      if (proposed.length) {
        parts.push('\nPROPOSED TEAM (this grant):');
        parts.push('| Designation | Monthly salary ₹ | Range |');
        parts.push('|---|---|---|');
        for (const r of proposed) {
          const range = (r.salaryRangeMin || r.salaryRangeMax) ? `₹${r.salaryRangeMin || '?'}–₹${r.salaryRangeMax || '?'}` : '—';
          parts.push(`| ${r.designation} | ₹${r.monthlySalary || '—'}/mo | ${range} |`);
        }
      }
      return parts.length ? parts.join('\n') : '';
    }

    function buildPddBlock(): string {
      const parts: string[] = [];
      if (pddData.context)               parts.push(`Context:\n${pddData.context}`);
      if (pddData.goal)                  parts.push(`Goal:\n${pddData.goal}`);
      if (pddData.historyWithFoundation) parts.push(`Programme history:\n${pddData.historyWithFoundation}`);
      if (pddData.effects?.filter(Boolean).length) {
        parts.push('Effects:');
        pddData.effects.filter(Boolean).forEach((e: string) => parts.push(`- ${e}`));
      }
      if (pddData.keyInterventions?.filter(Boolean).length) {
        parts.push('Key interventions:');
        pddData.keyInterventions.filter(Boolean).forEach((i: string) => parts.push(`- ${i}`));
      }
      if (pddData.peopleInvolved) parts.push(`People involved:\n${pddData.peopleInvolved}`);
      return parts.length ? `PROGRAMME DESIGN:\n${parts.join('\n\n')}` : '';
    }

    const structuredBlocks = [buildOrgBlock(), buildFinanceBlock(), buildPddBlock()].filter(Boolean).join('\n\n');

    // Download and process files from Vercel Blob URLs
    const blobUrlsRaw = formData.get('blobUrls') as string;
    const blobUrls: string[] = blobUrlsRaw ? JSON.parse(blobUrlsRaw) : [];
    const {
      textDocs, pdfDocs, budgetParts, extractedImages, warnings: corpusWarnings,
    } = await downloadAndProcess(blobUrls);
    const imageDocs: ImageDoc[] = (await uploadImagesToBlob(extractedImages)).map(img => ({
      name: img.name,
      mediaType: img.mediaType,
      base64: img.buffer.toString('base64'),
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

    // Tell the model what never arrived, so it cannot mistake a pipeline failure
    // for a fact the documents omit.
    const warningsBlock = corpusWarnings.length > 0
      ? `\n=== SOURCE CORPUS IS INCOMPLETE ===\n${corpusWarnings.map(w => `- ${w}`).join('\n')}\nTreat the affected material as unavailable, not as absent from the source. Leave the fields it would have supplied as [to be filled], and do not invent, infer, estimate or round any figure it would have carried.\n`
      : '';

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

${budgetBlock}${warningsBlock}${imageNote}${pdfNote}

${meta.docType === 'programme_design'
  ? 'Draft the complete internal programme design note now. Follow the template structure exactly. Where a figure or fact is not in the documents, write "[to be filled]" in that field only — do not add any commentary, summary of gaps, or readiness assessment.'
  : `Draft the complete internal grant approval note now. Follow the template structure exactly.

Critical requirements:
1. OPEX WORKING: Under "Average Annual Spend", show the full calculation table (FY | Gross expenditure | Less: capital | Less: carryover | Regular opex) for each of the 3 years plus average row. Do not summarise — show every number.
2. COST PER BENEFICIARY: In the Remarks section, write the arithmetic explicitly: "₹X L ÷ N beneficiaries ÷ Y years = ₹Z per person per year". Then compare to cost norms.
3. OUR SENSE OF THEIR WORK: Use the staff notes as raw material. Include at least one specific anecdote or field observation — something concrete that happened, not a generalisation. State any concern plainly.
4. SPECIFICITY: Every number in the documents must appear in the note. Do not write "substantial" or "significant" — use the actual figure.
5. NO PADDING: Do not add sentences that restate what is already clear. If a paragraph has no new information to add, make it shorter.
6. Where a figure or fact is not in the documents, write "[to be filled]" in that field only — do not add any commentary, summary of gaps, or readiness assessment anywhere in the note.`
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

    // Phase 2: pull rule text from the capabilities table (admin-edited there).
    // Doc-type's apply_financial_rules still gates whether financial+cost apply.
    const docTypeRows = await sql`
      SELECT key, label, template_rules, export_mode, apply_financial_rules
      FROM doc_types WHERE key = ${meta.docType}
    `;
    const docTypeRow = (docTypeRows[0] as any) || {
      key: meta.docType,
      template_rules: '',
      apply_financial_rules: true,
    };
    const systemPrompt = await buildSystemPromptFromCaps(docTypeRow);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const anthropicStream = client.messages.stream({
            model: 'claude-opus-5-5',
            // A full note with annexures exceeds 16k output tokens; this request
            // streams, so the larger ceiling costs nothing until it is used.
            max_tokens: 64000,
            system: systemPrompt,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'high' },
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
          // The uploaded source documents are NOT deleted here. They used to be,
          // and grant_note_metadata.source_documents still points at them — so
          // every later re-ingest, refresh or export read dead URLs. Blob cleanup
          // belongs to whatever deletes the note, not to one draft run.
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
