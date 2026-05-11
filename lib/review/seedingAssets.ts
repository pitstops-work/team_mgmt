// Static SVG HTML for the Seeding Programme diagrams.
// These are exact equivalents of WorkflowDiagram.tsx and CostChart.tsx
// extracted as strings for server-side DB seeding (avoids react-dom/server).

export const WORKFLOW_HTML = `<div class="workflow">
<svg class="workflow-svg" viewBox="0 0 1000 380" xmlns="http://www.w3.org/2000/svg">
<defs>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
<path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8E8E0" stroke-width="0.5"/>
</pattern>
<marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
<path d="M0,0 L9,3 L0,6 z" fill="#1A1A1A"/>
</marker>
</defs>
<rect width="1000" height="380" fill="url(#grid)"/>
<text x="20" y="40" font-family="JetBrains Mono, monospace" font-size="10" fill="#B8500A" letter-spacing="2">CENTRAL FUNCTIONS</text>
<line x1="20" y1="50" x2="650" y2="50" stroke="#B8500A" stroke-width="1" stroke-dasharray="3 3"/>
<text x="680" y="40" font-family="JetBrains Mono, monospace" font-size="10" fill="#1F4D3A" letter-spacing="2">GEO TEAM</text>
<line x1="680" y1="50" x2="980" y2="50" stroke="#1F4D3A" stroke-width="1" stroke-dasharray="3 3"/>
<rect x="20" y="80" width="150" height="100" fill="#FAFAF7" stroke="#1A1A1A" stroke-width="1.5"/>
<text x="32" y="100" font-family="JetBrains Mono, monospace" font-size="9" fill="#777" letter-spacing="1.5">01 / SOURCING</text>
<text x="32" y="124" font-family="Iowan Old Style, Georgia, serif" font-size="14" font-weight="700" fill="#1A1A1A">Funnel</text>
<line x1="32" y1="134" x2="160" y2="134" stroke="#D4D4CC" stroke-width="0.5"/>
<text x="32" y="148" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">APU alumni office</text>
<text x="32" y="162" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">TISS · Jindal · IRMA</text>
<text x="32" y="176" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Open call portal</text>
<line x1="170" y1="130" x2="200" y2="130" stroke="#1A1A1A" stroke-width="1.5" marker-end="url(#arrow)"/>
<rect x="200" y="80" width="150" height="100" fill="#FAFAF7" stroke="#1A1A1A" stroke-width="1.5"/>
<text x="212" y="100" font-family="JetBrains Mono, monospace" font-size="9" fill="#777" letter-spacing="1.5">02 / SCREENING</text>
<text x="212" y="124" font-family="Iowan Old Style, Georgia, serif" font-size="14" font-weight="700" fill="#1A1A1A">Two stages</text>
<line x1="212" y1="134" x2="340" y2="134" stroke="#D4D4CC" stroke-width="0.5"/>
<text x="212" y="148" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Application review</text>
<text x="212" y="162" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Structured panel</text>
<text x="212" y="176" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">+ reference check</text>
<line x1="350" y1="130" x2="380" y2="130" stroke="#1A1A1A" stroke-width="1.5" marker-end="url(#arrow)"/>
<rect x="380" y="80" width="150" height="100" fill="#FAFAF7" stroke="#1A1A1A" stroke-width="1.5"/>
<text x="392" y="100" font-family="JetBrains Mono, monospace" font-size="9" fill="#777" letter-spacing="1.5">03 / SELECTION</text>
<text x="392" y="124" font-family="Iowan Old Style, Georgia, serif" font-size="14" font-weight="700" fill="#1A1A1A">Final cohort</text>
<line x1="392" y1="134" x2="520" y2="134" stroke="#D4D4CC" stroke-width="0.5"/>
<text x="392" y="148" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Panel: central</text>
<text x="392" y="162" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">+ geo team head</text>
<text x="392" y="176" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">+ HR</text>
<line x1="530" y1="130" x2="650" y2="130" stroke="#B8500A" stroke-width="2" stroke-dasharray="4 4" marker-end="url(#arrow)"/>
<text x="555" y="118" font-family="JetBrains Mono, monospace" font-size="9" fill="#B8500A" letter-spacing="1">HAND-OFF</text>
<rect x="650" y="80" width="150" height="100" fill="#DCE8E0" stroke="#1F4D3A" stroke-width="1.5"/>
<text x="662" y="100" font-family="JetBrains Mono, monospace" font-size="9" fill="#1F4D3A" letter-spacing="1.5">04 / SEEDING</text>
<text x="662" y="124" font-family="Iowan Old Style, Georgia, serif" font-size="14" font-weight="700" fill="#1A1A1A">Year 1 setup</text>
<line x1="662" y1="134" x2="790" y2="134" stroke="#1F4D3A" stroke-width="0.5" opacity="0.4"/>
<text x="662" y="148" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Org registration</text>
<text x="662" y="162" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">12A · 80G · FCRA</text>
<text x="662" y="176" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Settlement allocation</text>
<line x1="800" y1="130" x2="830" y2="130" stroke="#1F4D3A" stroke-width="1.5" marker-end="url(#arrow)"/>
<rect x="830" y="80" width="150" height="100" fill="#DCE8E0" stroke="#1F4D3A" stroke-width="1.5"/>
<text x="842" y="100" font-family="JetBrains Mono, monospace" font-size="9" fill="#1F4D3A" letter-spacing="1.5">05 / HANDHOLD</text>
<text x="842" y="124" font-family="Iowan Old Style, Georgia, serif" font-size="14" font-weight="700" fill="#1A1A1A">Y2-Y5 ops</text>
<line x1="842" y1="134" x2="970" y2="134" stroke="#1F4D3A" stroke-width="0.5" opacity="0.4"/>
<text x="842" y="148" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Daily support</text>
<text x="842" y="162" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Quarterly reviews</text>
<text x="842" y="176" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Annual continuation</text>
<text x="20" y="220" font-family="JetBrains Mono, monospace" font-size="10" fill="#777" letter-spacing="2">CONTINUOUS SUPPORT LAYERS</text>
<line x1="20" y1="228" x2="980" y2="228" stroke="#D4D4CC" stroke-width="0.5"/>
<rect x="20" y="245" width="232" height="65" fill="#F2E8C8" stroke="#8B6914" stroke-width="1"/>
<text x="32" y="265" font-family="JetBrains Mono, monospace" font-size="9" fill="#8B6914" letter-spacing="1.5">URC</text>
<text x="32" y="282" font-family="Iowan Old Style, serif" font-size="13" font-weight="700" fill="#1A1A1A">Capacity building</text>
<text x="32" y="298" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Curriculum · regional batches</text>
<rect x="262" y="245" width="232" height="65" fill="#F4E6D8" stroke="#B8500A" stroke-width="1"/>
<text x="274" y="265" font-family="JetBrains Mono, monospace" font-size="9" fill="#B8500A" letter-spacing="1.5">CENTRAL</text>
<text x="274" y="282" font-family="Iowan Old Style, serif" font-size="13" font-weight="700" fill="#1A1A1A">Compliance &amp; setup</text>
<text x="274" y="298" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Registration · policies · MIS</text>
<rect x="504" y="245" width="232" height="65" fill="#DCE8E0" stroke="#1F4D3A" stroke-width="1"/>
<text x="516" y="265" font-family="JetBrains Mono, monospace" font-size="9" fill="#1F4D3A" letter-spacing="1.5">GEO TEAM</text>
<text x="516" y="282" font-family="Iowan Old Style, serif" font-size="13" font-weight="700" fill="#1A1A1A">Field handholding</text>
<text x="516" y="298" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">1 person : 12-15 candidates</text>
<rect x="746" y="245" width="234" height="65" fill="#FAFAF7" stroke="#1A1A1A" stroke-width="1"/>
<text x="758" y="265" font-family="JetBrains Mono, monospace" font-size="9" fill="#1A1A1A" letter-spacing="1.5">PARTNERS</text>
<text x="758" y="282" font-family="Iowan Old Style, serif" font-size="13" font-weight="700" fill="#1A1A1A">Mentor organisations</text>
<text x="758" y="298" font-family="Iowan Old Style, serif" font-size="11" fill="#4A4A4A">Existing partners in geography</text>
<text x="20" y="345" font-family="JetBrains Mono, monospace" font-size="10" fill="#777" letter-spacing="2">DURATION</text>
<line x1="100" y1="342" x2="980" y2="342" stroke="#1A1A1A" stroke-width="1"/>
<text x="120" y="362" font-family="JetBrains Mono, monospace" font-size="11" fill="#1A1A1A">Y1 — induction</text>
<text x="320" y="362" font-family="JetBrains Mono, monospace" font-size="11" fill="#1A1A1A">Y2-Y5 — independent operation</text>
<text x="780" y="362" font-family="JetBrains Mono, monospace" font-size="11" fill="#B8500A">→ graduation</text>
</svg>
</div>`;

export const COST_CHART_HTML = `<div class="chart-card">
<div class="chart-card-head">
<div class="chart-title">Active candidates &amp; annual outlay</div>
<div class="chart-meta">Y1 → Y5 · cumulative ₹460 Cr</div>
</div>
<svg viewBox="0 0 800 320" xmlns="http://www.w3.org/2000/svg">
<line x1="60" y1="20" x2="60" y2="260" stroke="#1A1A1A" stroke-width="1"/>
<line x1="60" y1="260" x2="760" y2="260" stroke="#1A1A1A" stroke-width="1"/>
<line x1="60" y1="60" x2="760" y2="60" stroke="#E8E8E0" stroke-width="0.5"/>
<line x1="60" y1="110" x2="760" y2="110" stroke="#E8E8E0" stroke-width="0.5"/>
<line x1="60" y1="160" x2="760" y2="160" stroke="#E8E8E0" stroke-width="0.5"/>
<line x1="60" y1="210" x2="760" y2="210" stroke="#E8E8E0" stroke-width="0.5"/>
<text x="50" y="65" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">1000</text>
<text x="50" y="115" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">750</text>
<text x="50" y="165" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">500</text>
<text x="50" y="215" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">250</text>
<text x="50" y="263" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">0</text>
<text x="770" y="65" font-family="JetBrains Mono, monospace" font-size="10" fill="#B8500A">170</text>
<text x="770" y="115" font-family="JetBrains Mono, monospace" font-size="10" fill="#B8500A">128</text>
<text x="770" y="165" font-family="JetBrains Mono, monospace" font-size="10" fill="#B8500A">85</text>
<text x="770" y="215" font-family="JetBrains Mono, monospace" font-size="10" fill="#B8500A">42</text>
<text x="130" y="280" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">Y1</text>
<text x="265" y="280" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">Y2</text>
<text x="400" y="280" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">Y3</text>
<text x="535" y="280" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">Y4</text>
<text x="670" y="280" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#777">Y5</text>
<rect x="100" y="244" width="60" height="16" fill="#1F4D3A"/>
<text x="130" y="240" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#1A1A1A">80</text>
<rect x="235" y="208" width="60" height="52" fill="#1F4D3A"/>
<text x="265" y="204" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#1A1A1A">260</text>
<rect x="370" y="158" width="60" height="102" fill="#1F4D3A"/>
<text x="400" y="154" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#1A1A1A">510</text>
<rect x="505" y="108" width="60" height="152" fill="#1F4D3A"/>
<text x="535" y="104" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#1A1A1A">760</text>
<rect x="640" y="60" width="60" height="200" fill="#1F4D3A"/>
<text x="670" y="55" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="10" fill="#1A1A1A">1000</text>
<polyline points="130,243 265,206 400,156 535,107 670,60" fill="none" stroke="#B8500A" stroke-width="2"/>
<circle cx="130" cy="243" r="4" fill="#FAFAF7" stroke="#B8500A" stroke-width="2"/>
<circle cx="265" cy="206" r="4" fill="#FAFAF7" stroke="#B8500A" stroke-width="2"/>
<circle cx="400" cy="156" r="4" fill="#FAFAF7" stroke="#B8500A" stroke-width="2"/>
<circle cx="535" cy="107" r="4" fill="#FAFAF7" stroke="#B8500A" stroke-width="2"/>
<circle cx="670" cy="60" r="4" fill="#FAFAF7" stroke="#B8500A" stroke-width="2"/>
<rect x="60" y="295" width="14" height="10" fill="#1F4D3A"/>
<text x="80" y="304" font-family="JetBrains Mono, monospace" font-size="10" fill="#1A1A1A">Active candidates</text>
<line x1="240" y1="300" x2="260" y2="300" stroke="#B8500A" stroke-width="2"/>
<circle cx="250" cy="300" r="3" fill="#FAFAF7" stroke="#B8500A" stroke-width="2"/>
<text x="270" y="304" font-family="JetBrains Mono, monospace" font-size="10" fill="#B8500A">Annual outlay (₹ Cr)</text>
</svg>
</div>`;
