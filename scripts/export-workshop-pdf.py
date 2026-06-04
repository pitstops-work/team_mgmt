#!/usr/bin/env python3
"""Export the 7 workshop decks under public/workshop/ into a single combined PDF.

Each .html deck contains multiple <div class="slide">; only one is shown at a
time via JS + CSS. We inject overrides so every slide renders as its own
landscape page, then print each deck to PDF and merge with pdfunite.
"""

import asyncio
import subprocess
import sys
from pathlib import Path

from playwright.async_api import async_playwright

REPO = Path(__file__).resolve().parent.parent
WORKSHOP_DIR = REPO / "public" / "workshop"
OUT_DIR = REPO / "tmp" / "workshop-pdf"
FINAL_PDF = REPO / "workshop-decks.pdf"

DECKS = [
    "01-why.html",
    "02-approach.html",
    "03-battles.html",
    "04-inside-team.html",
    "05-partners.html",
    "06-ops-plan.html",
    "07-goal-building.html",
]

# 16:9 at print-friendly size. CSS px, not device px.
WIDTH = 1600
HEIGHT = 900

PRINT_CSS = f"""
  html, body {{
    height: auto !important;
    overflow: visible !important;
    background: #0f172a;
  }}
  .deck {{
    height: auto !important;
    width: 100% !important;
  }}
  .slide {{
    display: flex !important;
    opacity: 1 !important;
    position: relative !important;
    inset: auto !important;
    width: {WIDTH}px !important;
    height: {HEIGHT}px !important;
    page-break-after: always;
    break-after: page;
    animation: none !important;
  }}
  .slide > * {{ animation: none !important; }}
  .slide:last-child {{
    page-break-after: auto;
    break-after: auto;
  }}
  #nav, .progress, #slide-counter {{ display: none !important; }}
  @page {{
    size: {WIDTH}px {HEIGHT}px;
    margin: 0;
  }}
"""


async def render_deck(browser, deck: Path, out: Path) -> int:
    page = await browser.new_page(viewport={"width": WIDTH, "height": HEIGHT})
    await page.goto(deck.as_uri(), wait_until="load")
    await page.add_style_tag(content=PRINT_CSS)
    # Give the layout a beat to settle before printing.
    await page.wait_for_timeout(200)
    slide_count = await page.locator(".slide").count()
    await page.pdf(
        path=str(out),
        width=f"{WIDTH}px",
        height=f"{HEIGHT}px",
        print_background=True,
        margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
        prefer_css_page_size=True,
    )
    await page.close()
    return slide_count


async def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    parts: list[Path] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name in DECKS:
            src = WORKSHOP_DIR / name
            if not src.exists():
                print(f"missing: {src}", file=sys.stderr)
                sys.exit(1)
            out = OUT_DIR / name.replace(".html", ".pdf")
            n = await render_deck(browser, src, out)
            print(f"  {name}: {n} slides -> {out.name}")
            parts.append(out)
        await browser.close()

    print(f"merging {len(parts)} PDFs -> {FINAL_PDF}")
    subprocess.run(
        ["pdfunite", *[str(p) for p in parts], str(FINAL_PDF)],
        check=True,
    )
    print(f"done: {FINAL_PDF}")


if __name__ == "__main__":
    asyncio.run(main())
