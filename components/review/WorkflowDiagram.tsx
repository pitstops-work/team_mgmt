// components/WorkflowDiagram.tsx
export default function WorkflowDiagram() {
  return (
    <div className="workflow">
      <svg className="workflow-svg" viewBox="0 0 1000 380" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#E8E8E0" strokeWidth="0.5"/>
          </pattern>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <path d="M0,0 L9,3 L0,6 z" fill="#1A1A1A"/>
          </marker>
        </defs>
        <rect width="1000" height="380" fill="url(#grid)"/>

        {/* split labels */}
        <text x="20" y="40" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#B8500A" letterSpacing="2">CENTRAL FUNCTIONS</text>
        <line x1="20" y1="50" x2="650" y2="50" stroke="#B8500A" strokeWidth="1" strokeDasharray="3 3"/>
        <text x="680" y="40" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1F4D3A" letterSpacing="2">GEO TEAM</text>
        <line x1="680" y1="50" x2="980" y2="50" stroke="#1F4D3A" strokeWidth="1" strokeDasharray="3 3"/>

        {/* Stage 1 */}
        <rect x="20" y="80" width="150" height="100" fill="#FAFAF7" stroke="#1A1A1A" strokeWidth="1.5"/>
        <text x="32" y="100" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#777" letterSpacing="1.5">01 / SOURCING</text>
        <text x="32" y="124" fontFamily="Iowan Old Style, Georgia, serif" fontSize="14" fontWeight="700" fill="#1A1A1A">Funnel</text>
        <line x1="32" y1="134" x2="160" y2="134" stroke="#D4D4CC" strokeWidth="0.5"/>
        <text x="32" y="148" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">APU alumni office</text>
        <text x="32" y="162" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">TISS · Jindal · IRMA</text>
        <text x="32" y="176" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Open call portal</text>
        <line x1="170" y1="130" x2="200" y2="130" stroke="#1A1A1A" strokeWidth="1.5" markerEnd="url(#arrow)"/>

        {/* Stage 2 */}
        <rect x="200" y="80" width="150" height="100" fill="#FAFAF7" stroke="#1A1A1A" strokeWidth="1.5"/>
        <text x="212" y="100" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#777" letterSpacing="1.5">02 / SCREENING</text>
        <text x="212" y="124" fontFamily="Iowan Old Style, Georgia, serif" fontSize="14" fontWeight="700" fill="#1A1A1A">Two stages</text>
        <line x1="212" y1="134" x2="340" y2="134" stroke="#D4D4CC" strokeWidth="0.5"/>
        <text x="212" y="148" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Application review</text>
        <text x="212" y="162" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Structured panel</text>
        <text x="212" y="176" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">+ reference check</text>
        <line x1="350" y1="130" x2="380" y2="130" stroke="#1A1A1A" strokeWidth="1.5" markerEnd="url(#arrow)"/>

        {/* Stage 3 */}
        <rect x="380" y="80" width="150" height="100" fill="#FAFAF7" stroke="#1A1A1A" strokeWidth="1.5"/>
        <text x="392" y="100" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#777" letterSpacing="1.5">03 / SELECTION</text>
        <text x="392" y="124" fontFamily="Iowan Old Style, Georgia, serif" fontSize="14" fontWeight="700" fill="#1A1A1A">Final cohort</text>
        <line x1="392" y1="134" x2="520" y2="134" stroke="#D4D4CC" strokeWidth="0.5"/>
        <text x="392" y="148" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Panel: central</text>
        <text x="392" y="162" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">+ geo team head</text>
        <text x="392" y="176" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">+ HR</text>
        <line x1="530" y1="130" x2="650" y2="130" stroke="#B8500A" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#arrow)"/>
        <text x="555" y="118" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#B8500A" letterSpacing="1">HAND-OFF</text>

        {/* Stage 4 */}
        <rect x="650" y="80" width="150" height="100" fill="#DCE8E0" stroke="#1F4D3A" strokeWidth="1.5"/>
        <text x="662" y="100" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#1F4D3A" letterSpacing="1.5">04 / SEEDING</text>
        <text x="662" y="124" fontFamily="Iowan Old Style, Georgia, serif" fontSize="14" fontWeight="700" fill="#1A1A1A">Year 1 setup</text>
        <line x1="662" y1="134" x2="790" y2="134" stroke="#1F4D3A" strokeWidth="0.5" opacity="0.4"/>
        <text x="662" y="148" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Org registration</text>
        <text x="662" y="162" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">12A · 80G · FCRA</text>
        <text x="662" y="176" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Settlement allocation</text>
        <line x1="800" y1="130" x2="830" y2="130" stroke="#1F4D3A" strokeWidth="1.5" markerEnd="url(#arrow)"/>

        {/* Stage 5 */}
        <rect x="830" y="80" width="150" height="100" fill="#DCE8E0" stroke="#1F4D3A" strokeWidth="1.5"/>
        <text x="842" y="100" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#1F4D3A" letterSpacing="1.5">05 / HANDHOLD</text>
        <text x="842" y="124" fontFamily="Iowan Old Style, Georgia, serif" fontSize="14" fontWeight="700" fill="#1A1A1A">Y2-Y5 ops</text>
        <line x1="842" y1="134" x2="970" y2="134" stroke="#1F4D3A" strokeWidth="0.5" opacity="0.4"/>
        <text x="842" y="148" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Daily support</text>
        <text x="842" y="162" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Quarterly reviews</text>
        <text x="842" y="176" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Annual continuation</text>

        {/* Support layers */}
        <text x="20" y="220" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777" letterSpacing="2">CONTINUOUS SUPPORT LAYERS</text>
        <line x1="20" y1="228" x2="980" y2="228" stroke="#D4D4CC" strokeWidth="0.5"/>

        <rect x="20" y="245" width="232" height="65" fill="#F2E8C8" stroke="#8B6914" strokeWidth="1"/>
        <text x="32" y="265" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#8B6914" letterSpacing="1.5">URC</text>
        <text x="32" y="282" fontFamily="Iowan Old Style, serif" fontSize="13" fontWeight="700" fill="#1A1A1A">Capacity building</text>
        <text x="32" y="298" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Curriculum · regional batches</text>

        <rect x="262" y="245" width="232" height="65" fill="#F4E6D8" stroke="#B8500A" strokeWidth="1"/>
        <text x="274" y="265" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#B8500A" letterSpacing="1.5">CENTRAL</text>
        <text x="274" y="282" fontFamily="Iowan Old Style, serif" fontSize="13" fontWeight="700" fill="#1A1A1A">Compliance &amp; setup</text>
        <text x="274" y="298" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Registration · policies · MIS</text>

        <rect x="504" y="245" width="232" height="65" fill="#DCE8E0" stroke="#1F4D3A" strokeWidth="1"/>
        <text x="516" y="265" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#1F4D3A" letterSpacing="1.5">GEO TEAM</text>
        <text x="516" y="282" fontFamily="Iowan Old Style, serif" fontSize="13" fontWeight="700" fill="#1A1A1A">Field handholding</text>
        <text x="516" y="298" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">1 person : 12-15 candidates</text>

        <rect x="746" y="245" width="234" height="65" fill="#FAFAF7" stroke="#1A1A1A" strokeWidth="1"/>
        <text x="758" y="265" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#1A1A1A" letterSpacing="1.5">PARTNERS</text>
        <text x="758" y="282" fontFamily="Iowan Old Style, serif" fontSize="13" fontWeight="700" fill="#1A1A1A">Mentor organisations</text>
        <text x="758" y="298" fontFamily="Iowan Old Style, serif" fontSize="11" fill="#4A4A4A">Existing partners in geography</text>

        <text x="20" y="345" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777" letterSpacing="2">DURATION</text>
        <line x1="100" y1="342" x2="980" y2="342" stroke="#1A1A1A" strokeWidth="1"/>
        <text x="120" y="362" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#1A1A1A">Y1 — induction</text>
        <text x="320" y="362" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#1A1A1A">Y2-Y5 — independent operation</text>
        <text x="780" y="362" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#B8500A">→ graduation</text>
      </svg>
    </div>
  );
}
