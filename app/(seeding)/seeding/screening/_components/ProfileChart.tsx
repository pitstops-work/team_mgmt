/**
 * The spider chart: one axis per rubric dimension, scored 1–5.
 *
 * Plain SVG so it renders on the server and in print. Axes come from the
 * rubric, so adding or renaming a dimension in Settings changes the chart.
 */

export type ChartSeries = {
  label: string;
  /** One value per axis, 1–5; null where not scored yet. */
  values: (number | null)[];
  color: string;
  dashed?: boolean;
};

export default function ProfileChart({
  axes,
  series,
  size = 260,
}: {
  axes: string[];
  series: ChartSeries[];
  size?: number;
}) {
  const n = axes.length;
  if (n < 3) return null;
  const pad = 84;
  const cx = size / 2 + pad;
  const cy = size / 2 + 30;
  const R = size / 2 - 10;
  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const point = (i: number, v: number) => {
    const r = (Math.max(0, Math.min(5, v)) / 5) * R;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))] as const;
  };

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${size + pad * 2} ${size + 60}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Profile across ${axes.join(", ")}`}
      >
        {[1, 2, 3, 4, 5].map((ring) => (
          <polygon
            key={ring}
            points={axes.map((_, i) => point(i, ring).join(",")).join(" ")}
            fill={ring === 5 ? "#fafaf9" : "none"}
            stroke="#e7e5e4"
            strokeWidth={1}
          />
        ))}
        {axes.map((label, i) => {
          const [x, y] = point(i, 5);
          const [lx, ly] = point(i, 5.65);
          const anchor = Math.abs(lx - cx) < 4 ? "middle" : lx > cx ? "start" : "end";
          return (
            <g key={label + i}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="#e7e5e4" />
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={10} fill="#57534e">
                {wrap(label).map((line, k, arr) => (
                  <tspan key={k} x={lx} dy={k === 0 ? `${-(arr.length - 1) * 0.55}em` : "1.1em"}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
        {series.map((s) => {
          const scored = s.values.every((v) => v !== null);
          const pts = s.values.map((v, i) => point(i, v ?? 0));
          return (
            <g key={s.label}>
              {scored && (
                <polygon
                  points={pts.map((p) => p.join(",")).join(" ")}
                  fill={s.dashed ? "none" : s.color}
                  fillOpacity={s.dashed ? 0 : 0.15}
                  stroke={s.color}
                  strokeWidth={1.5}
                  strokeDasharray={s.dashed ? "4 3" : undefined}
                />
              )}
              {pts.map(([x, y], i) =>
                s.values[i] === null ? null : <circle key={i} cx={x} cy={y} r={2.5} fill={s.color} />,
              )}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="flex flex-wrap justify-center gap-3 text-[11px] text-stone-500">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1">
              <svg width="14" height="6" aria-hidden>
                <line x1="0" y1="3" x2="14" y2="3" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "3 2" : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

/** Short lines (up to three) rather than one long label running off the chart. */
function wrap(label: string, width = 14): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of label.split(/\s+/)) {
    if (line && (line + " " + w).length > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  if (lines.length > 3) return [...lines.slice(0, 2), lines.slice(2).join(" ")];
  return lines;
}
