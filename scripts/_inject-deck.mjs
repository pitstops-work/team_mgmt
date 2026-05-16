// Shared helper for injecting hand-authored content into skeleton training decks.
// Used by all batch authoring scripts under scripts/author-decks/.
//
// Each authoring script defines per-slug content:
//   - newSlide2Html: replacement HTML for the "Why this matters" slide
//   - diagramSlides: array of HTML strings to insert after the journey overview
//
// This helper handles: sentinel comment, placeholder-slide-2 swap, journey-overview
// anchor detection, diagram slide insertion, sequential ID renumbering, JS counter
// sync, and write-back. It is robust to templates with or without a parameters slide.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '..');
export const TRAINING_DIR = resolve(PROJECT_ROOT, 'public', 'training');

const SENTINEL = '<!-- HAND_AUTHORED: do not regenerate this file via gen-training-deck.mjs -->';

export async function injectDeckContent({ slug, newSlide2Html, diagramSlides }) {
  const filePath = resolve(TRAINING_DIR, `${slug}.html`);
  let src = await readFile(filePath, 'utf8');

  // 1. Sentinel
  if (!src.includes(SENTINEL)) {
    src = src.replace('<!DOCTYPE html>', `<!DOCTYPE html>\n${SENTINEL}`);
  }

  // 2. Replace placeholder slide 2
  const placeholderRe = /<div class="slide bg-rose" id="s2">[\s\S]*?\[Hand-author the 'why' here\][\s\S]*?<\/div><\/div>/;
  if (!placeholderRe.test(src)) throw new Error(`[${slug}] placeholder slide 2 not found`);
  src = src.replace(placeholderRe, newSlide2Html);

  // 3. Insert diagram slides immediately after the journey overview slide.
  //    The journey slide uses `bg-dark` and contains the THE JOURNEY label.
  //    Insertion handles whether parameters slide is present (changes slide id) or not.
  const journeyAnchorRe = /(<div class="slide bg-dark" id="s\d+">\s+<div class="label"[^>]*>THE JOURNEY<\/div>[\s\S]*?<\/div><\/div>)/;
  if (!journeyAnchorRe.test(src)) throw new Error(`[${slug}] journey overview slide not found`);
  src = src.replace(journeyAnchorRe, '$1' + diagramSlides.join(''));

  // 4. Renumber all slide IDs sequentially (handles temp alphanumeric IDs from inserts)
  let counter = 0;
  src = src.replace(/<div class="slide ([^"]+)" id="(s[A-Za-z0-9_]+)">/g, (m, cls) => {
    counter += 1;
    return `<div class="slide ${cls}" id="s${counter}">`;
  });

  // 5. Sync JS slide counter
  src = src.replace(/const total=\d+;/, `const total=${counter};`);
  src = src.replace(/1 \/ \d+<\/span>/, `1 / ${counter}</span>`);

  await writeFile(filePath, src, 'utf8');
  return counter;
}

// Shared content helpers — every batch script imports these for visual consistency.
export const whyBox = (num, body) => `
  <div style="padding:20px 24px;background:rgba(251,113,133,.08);border-left:3px solid #fb7185;border-radius:10px">
    <div style="font-size:30px;font-weight:800;color:#fda4af">${num}</div>
    <p class="body" style="font-size:14px;margin-top:6px">${body}</p>
  </div>`;

export const whySlide = (title, sub, boxes, closer = null) => `<div class="slide bg-rose" id="s2">
      <div class="label" style="color:#fb7185">WHY THIS GOAL MATTERS</div>
      <h2 class="title">${title}</h2>
      <h3 class="sub">${sub}</h3>
      <div style="margin-top:24px;display:grid;grid-template-columns:repeat(2,1fr);gap:16px;max-width:1080px">
        ${boxes.map(b => whyBox(b[0], b[1])).join('')}
      </div>
      ${closer ? `<p class="body" style="margin-top:24px;font-size:16px;color:#fecaca;font-style:italic;max-width:1080px">${closer}</p>` : ''}</div>`;

// Convenience helper for batches: apply N decks, log each.
export async function applyBatch(batch) {
  for (const { slug, newSlide2Html, diagramSlides } of batch) {
    try {
      const n = await injectDeckContent({ slug, newSlide2Html, diagramSlides });
      console.log(`✓ ${slug}  (${n} slides)`);
    } catch (e) {
      console.error(`✗ ${slug}: ${e.message}`);
    }
  }
}
