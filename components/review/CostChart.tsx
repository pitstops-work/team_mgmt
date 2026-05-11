// components/CostChart.tsx
export default function CostChart() {
  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <div className="chart-title">Active candidates &amp; annual outlay</div>
        <div className="chart-meta">Y1 → Y5 · cumulative ₹460 Cr</div>
      </div>
      <svg viewBox="0 0 800 320" xmlns="http://www.w3.org/2000/svg">
        <line x1="60" y1="20" x2="60" y2="260" stroke="#1A1A1A" strokeWidth="1"/>
        <line x1="60" y1="260" x2="760" y2="260" stroke="#1A1A1A" strokeWidth="1"/>
        <line x1="60" y1="60" x2="760" y2="60" stroke="#E8E8E0" strokeWidth="0.5"/>
        <line x1="60" y1="110" x2="760" y2="110" stroke="#E8E8E0" strokeWidth="0.5"/>
        <line x1="60" y1="160" x2="760" y2="160" stroke="#E8E8E0" strokeWidth="0.5"/>
        <line x1="60" y1="210" x2="760" y2="210" stroke="#E8E8E0" strokeWidth="0.5"/>

        <text x="50" y="65" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">1000</text>
        <text x="50" y="115" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">750</text>
        <text x="50" y="165" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">500</text>
        <text x="50" y="215" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">250</text>
        <text x="50" y="263" textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">0</text>

        <text x="770" y="65" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#B8500A">170</text>
        <text x="770" y="115" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#B8500A">128</text>
        <text x="770" y="165" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#B8500A">85</text>
        <text x="770" y="215" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#B8500A">42</text>

        <text x="130" y="280" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">Y1</text>
        <text x="265" y="280" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">Y2</text>
        <text x="400" y="280" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">Y3</text>
        <text x="535" y="280" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">Y4</text>
        <text x="670" y="280" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#777">Y5</text>

        <rect x="100" y="244" width="60" height="16" fill="#1F4D3A"/>
        <text x="130" y="240" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1A1A1A">80</text>
        <rect x="235" y="208" width="60" height="52" fill="#1F4D3A"/>
        <text x="265" y="204" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1A1A1A">260</text>
        <rect x="370" y="158" width="60" height="102" fill="#1F4D3A"/>
        <text x="400" y="154" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1A1A1A">510</text>
        <rect x="505" y="108" width="60" height="152" fill="#1F4D3A"/>
        <text x="535" y="104" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1A1A1A">760</text>
        <rect x="640" y="60" width="60" height="200" fill="#1F4D3A"/>
        <text x="670" y="55" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1A1A1A">1000</text>

        <polyline points="130,243 265,206 400,156 535,107 670,60"
          fill="none" stroke="#B8500A" strokeWidth="2"/>
        <circle cx="130" cy="243" r="4" fill="#FAFAF7" stroke="#B8500A" strokeWidth="2"/>
        <circle cx="265" cy="206" r="4" fill="#FAFAF7" stroke="#B8500A" strokeWidth="2"/>
        <circle cx="400" cy="156" r="4" fill="#FAFAF7" stroke="#B8500A" strokeWidth="2"/>
        <circle cx="535" cy="107" r="4" fill="#FAFAF7" stroke="#B8500A" strokeWidth="2"/>
        <circle cx="670" cy="60" r="4" fill="#FAFAF7" stroke="#B8500A" strokeWidth="2"/>

        <rect x="60" y="295" width="14" height="10" fill="#1F4D3A"/>
        <text x="80" y="304" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#1A1A1A">Active candidates</text>
        <line x1="240" y1="300" x2="260" y2="300" stroke="#B8500A" strokeWidth="2"/>
        <circle cx="250" cy="300" r="3" fill="#FAFAF7" stroke="#B8500A" strokeWidth="2"/>
        <text x="270" y="304" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#B8500A">Annual outlay (₹ Cr)</text>
      </svg>
    </div>
  );
}
