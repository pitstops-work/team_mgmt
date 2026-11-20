import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireActor, can } from "@/lib/urban/access";
import { loadProgrammeNumbers, effortsUnder, pct, type NumbersRow, type ProgrammeNumbers } from "@/lib/urban/numbers";
import { placePaths } from "@/lib/urban/places";
import { Card, Empty, PageTitle } from "../../_ui";
import PlaceMap, { type MapPoint } from "./PlaceMap";

export const dynamic = "force-dynamic";

const LEVEL: Record<string, string> = { city: "City", zone: "Zone", cluster: "Cluster", settlement: "Settlement", site: "Site", all: "All" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (v: number) => (Number.isInteger(v) ? v.toLocaleString("en-IN") : v.toLocaleString("en-IN", { maximumFractionDigits: 1 }));

// Programme screen (spec §7): need vs delivered by city → zone → cluster →
// settlement, a map of the same rows, the trend of outcome readings, and the
// efforts under the place. Click a place to go one level down.
export default async function NumbersPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ place?: string }> }) {
  const actor = await requireActor();
  if (!(await can(actor, "programme.view"))) redirect("/urban");
  const [{ key }, { place }] = await Promise.all([params, searchParams]);
  const d = await loadProgrammeNumbers(actor, key, place ?? null);
  if (!d) notFound();
  const efforts = await effortsUnder(actor, d.programme.id, d.place?.id ?? null);
  const paths = await placePaths([...new Set(efforts.map((e) => e.placeId))]);
  const base = `/urban/numbers/${d.programme.key}`;
  const kind = d.programme.settings.need?.type ?? "none";
  const t = d.total;

  return (
    <div className="space-y-6">
      <PageTitle
        title={d.programme.name}
        sub={<Crumbs d={d} base={base} />}
        action={<Link href="/urban/numbers" className="text-sm text-stone-500 hover:text-stone-800">All programmes</Link>}
      />

      {d.needNote && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{d.needNote}</p>}

      <Headline d={d} kind={kind} />

      <PlaceMap points={mapPoints(d, kind)} hrefBase={base} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-800">
          {d.rows.length ? `By ${(LEVEL[d.rows[0].level] ?? d.rows[0].level).toLowerCase()}` : "Places"}
        </h2>
        {d.rows.length === 0 ? <Empty>Nothing under {d.place?.name ?? "here"}.</Empty> : kind === "saturation" ? <SaturationTable d={d} base={base} /> : <CountTable d={d} base={base} kind={kind} />}
        {kind === "count" && t.need && (
          <p className="mt-2 text-xs text-stone-500">
            Need = ⌊{needPop(d)} ÷ {d.programme.settings.need?.type === "count" ? d.programme.settings.need.per_unit : ""}⌋ − existing, per settlement, from the latest assessment
            ({t.need.assessed} of {t.need.settlements} settlements assessed). Remaining = need − running efforts, per settlement, never below 0.
          </p>
        )}
        {kind === "saturation" && (
          <p className="mt-2 text-xs text-stone-500">Saturation = entitlements received ÷ eligible households, from each effort&apos;s latest figures, summed (never averaged) up the tree.</p>
        )}
      </section>

      <Trend d={d} kind={kind} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-stone-800">Efforts {d.place ? `in ${d.place.name}` : ""} · {efforts.length}</h2>
        {efforts.length === 0 ? <Empty>No open efforts you can see here.</Empty> : (
          <Card className="divide-y divide-stone-100">
            {efforts.map((e) => (
              <Link key={e.id} href={`/urban/efforts/${e.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-stone-50">
                <span className="min-w-0">
                  <span className="block truncate text-stone-800">{e.title}</span>
                  <span className="block truncate text-xs text-stone-500">{paths.get(e.placeId)}</span>
                </span>
                <span className="shrink-0 text-xs text-stone-500">{e.owner.name ?? e.owner.email}</span>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function needPop(d: ProgrammeNumbers) {
  const n = d.programme.settings.need;
  return n?.type === "count" ? n.population : "";
}

function Crumbs({ d, base }: { d: ProgrammeNumbers; base: string }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Link href={base} className="hover:text-stone-800">All places</Link>
      {d.crumbs.map((c) => (
        <span key={c.id} className="flex items-center gap-1">
          <span className="text-stone-300">/</span>
          {c.id === d.place?.id ? <span className="text-stone-700">{c.name}</span> : <Link href={`${base}?place=${c.id}`} className="hover:text-stone-800">{c.name}</Link>}
        </span>
      ))}
    </span>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" | "green" }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : "text-stone-900"}`}>{value}</p>
      {sub && <p className="text-xs text-stone-400">{sub}</p>}
    </Card>
  );
}

function Headline({ d, kind }: { d: ProgrammeNumbers; kind: string }) {
  const t = d.total;
  const tiles: React.ReactNode[] = [];
  if (kind === "count" && t.need) {
    tiles.push(<Tile key="need" label="Need" value={fmt(t.need.need)} sub="from the latest assessment" />);
    tiles.push(<Tile key="run" label="Running" value={fmt(t.efforts.running)} sub={t.efforts.settingUp ? `${t.efforts.settingUp} setting up` : undefined} />);
    tiles.push(<Tile key="rem" label="Need remaining" value={fmt(t.need.remaining)} tone={t.need.remaining > 0 ? "red" : "green"} />);
  } else if (kind === "saturation") {
    const all = t.saturation?._all;
    const p = all ? pct(all.received, all.eligible) : null;
    tiles.push(<Tile key="sat" label="Saturation, all schemes" value={p === null ? "—" : `${p}%`} sub={all ? `${fmt(all.received)} of ${fmt(all.eligible)} eligible` : "no figures yet"} />);
    tiles.push(<Tile key="rem" label="Need remaining" value={p === null ? "—" : `${Math.round((100 - p) * 10) / 10}%`} tone={p !== null && p < 100 ? "red" : undefined} />);
    if (t.coverage) tiles.push(<Tile key="cov" label="Coverage" value={`${t.coverage.covered} / ${t.coverage.total}`} sub={`${d.programme.settings.place_level}s with an effort`} />);
  } else {
    tiles.push(<Tile key="run" label="Running" value={fmt(t.efforts.running)} />);
    tiles.push(<Tile key="set" label="Setting up" value={fmt(t.efforts.settingUp)} />);
    if (t.coverage) tiles.push(<Tile key="cov" label="Coverage" value={`${t.coverage.covered} / ${t.coverage.total}`} sub={`${d.programme.settings.place_level}s with an effort`} />);
  }
  for (const o of d.outcomes) {
    if (kind === "saturation" && d.programme.settings.need?.type === "saturation" && o.key === d.programme.settings.need.received) continue;
    tiles.push(<Tile key={o.key} label={o.label} value={fmt(t.outcomes[o.key] ?? 0)} sub="latest figures, summed" />);
  }
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{tiles}</div>;
}

function PlaceCell({ r, base }: { r: NumbersRow; base: string }) {
  return r.hasChildren
    ? <Link href={`${base}?place=${r.id}`} className="font-medium text-stone-800 hover:underline">{r.name}</Link>
    : <span className="text-stone-800">{r.name}</span>;
}

function CountTable({ d, base, kind }: { d: ProgrammeNumbers; base: string; kind: string }) {
  const showNeed = kind === "count";
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="border-b border-stone-100 text-left text-xs text-stone-500">
          <tr>
            <th className="px-4 py-2 font-medium">Place</th>
            {showNeed && <th className="px-3 py-2 text-right font-medium">Need</th>}
            <th className="px-3 py-2 text-right font-medium">Running</th>
            <th className="px-3 py-2 text-right font-medium">Setting up</th>
            {showNeed && <th className="px-3 py-2 text-right font-medium">Remaining</th>}
            {d.outcomes.map((o) => <th key={o.key} className="px-3 py-2 text-right font-medium">{o.label}</th>)}
            {kind === "coverage" && <th className="px-3 py-2 text-right font-medium">Coverage</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50">
          {[...d.rows, d.total].map((r) => {
            const isTotal = r.id === d.total.id;
            return (
              <tr key={r.id} className={isTotal ? "bg-stone-50 font-medium" : ""}>
                <td className="px-4 py-2">{isTotal ? "Total" : <PlaceCell r={r} base={base} />}{!isTotal && showNeed && r.need && r.need.settlements > 0 && r.need.assessed < r.need.settlements && <span className="ml-1 text-xs text-stone-400">({r.need.assessed}/{r.need.settlements} assessed)</span>}</td>
                {showNeed && <td className="px-3 py-2 text-right tabular-nums">{r.need ? fmt(r.need.need) : "—"}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.efforts.running)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500">{fmt(r.efforts.settingUp)}</td>
                {showNeed && <td className={`px-3 py-2 text-right tabular-nums ${r.need && r.need.remaining > 0 ? "text-red-700" : "text-stone-400"}`}>{r.need ? fmt(r.need.remaining) : "—"}</td>}
                {d.outcomes.map((o) => <td key={o.key} className="px-3 py-2 text-right tabular-nums">{r.outcomes[o.key] !== undefined ? fmt(r.outcomes[o.key]) : "—"}</td>)}
                {kind === "coverage" && <td className="px-3 py-2 text-right tabular-nums">{r.coverage ? `${r.coverage.covered}/${r.coverage.total}` : "—"}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function satTone(p: number | null) {
  if (p === null) return "text-stone-300";
  if (p < 40) return "bg-red-50 text-red-800";
  if (p < 75) return "bg-amber-50 text-amber-800";
  return "bg-emerald-50 text-emerald-800";
}

function SatCell({ c }: { c: { received: number; eligible: number } | undefined }) {
  const p = c ? pct(c.received, c.eligible) : null;
  return (
    <td className="px-1 py-1 text-right">
      <span className={`inline-block min-w-[3.25rem] rounded px-1.5 py-0.5 tabular-nums ${satTone(p)}`} title={c ? `${fmt(c.received)} of ${fmt(c.eligible)}` : "no figures"}>{p === null ? "—" : `${Math.round(p)}%`}</span>
    </td>
  );
}

function SaturationTable({ d, base }: { d: ProgrammeNumbers; base: string }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: `${280 + d.dims.length * 64}px` }}>
        <thead className="border-b border-stone-100 text-left text-xs text-stone-500">
          <tr>
            <th className="sticky left-0 bg-white px-4 py-2 font-medium">Place</th>
            <th className="px-2 py-2 text-right font-medium">Coverage</th>
            <th className="px-2 py-2 text-right font-medium">All</th>
            {d.dims.map((x) => <th key={x.key} className="px-1 py-2 text-right font-medium">{x.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-50">
          {[...d.rows, d.total].map((r) => {
            const isTotal = r.id === d.total.id;
            return (
              <tr key={r.id} className={isTotal ? "bg-stone-50 font-medium" : ""}>
                <td className={`sticky left-0 px-4 py-2 ${isTotal ? "bg-stone-50" : "bg-white"}`}>{isTotal ? "Total" : <PlaceCell r={r} base={base} />}</td>
                <td className="px-2 py-2 text-right tabular-nums text-stone-600">{r.coverage ? `${r.coverage.covered}/${r.coverage.total}` : r.level === d.programme.settings.place_level ? (r.efforts.running + r.efforts.settingUp + r.efforts.other > 0 ? "yes" : "no") : "—"}</td>
                <SatCell c={r.saturation?._all} />
                {d.dims.map((x) => <SatCell key={x.key} c={r.saturation?.[x.key]} />)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function Trend({ d, kind }: { d: ProgrammeNumbers; kind: string }) {
  const series: { key: string; label: string; values: (number | null)[]; percent?: boolean }[] = [];
  if (kind === "saturation") series.push({ key: "_sat", label: "Saturation, all schemes", percent: true, values: d.trend.map((p) => (p.saturation ? pct(p.saturation.received, p.saturation.eligible) : null)) });
  for (const o of d.outcomes) series.push({ key: o.key, label: o.label, values: d.trend.map((p) => (p.values[o.key] ?? null)) });
  if (!series.length || series.every((s) => s.values.every((v) => v === null))) return null;
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-stone-800">Last six months</h2>
      <Card className="space-y-4 px-4 py-3">
        {series.map((s) => {
          const max = Math.max(1, ...s.values.map((v) => v ?? 0));
          return (
            <div key={s.key}>
              <p className="mb-1 text-xs text-stone-500">{s.label}</p>
              <div className="grid grid-cols-6 items-end gap-2">
                {s.values.map((v, i) => (
                  <div key={d.trend[i].month} className="flex flex-col items-center gap-1">
                    <span className="text-[11px] tabular-nums text-stone-700">{v === null ? "—" : s.percent ? `${Math.round(v)}%` : fmt(v)}</span>
                    <div className="flex h-16 w-full items-end rounded bg-stone-50">
                      <div className="w-full rounded bg-stone-400" style={{ height: `${v === null ? 0 : Math.max(4, ((s.percent ? v : v) / (s.percent ? 100 : max)) * 100)}%` }} />
                    </div>
                    <span className="text-[11px] text-stone-400">{MONTHS[Number(d.trend[i].month.slice(5, 7)) - 1]}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <p className="text-[11px] text-stone-400">Each month: the latest figure on or before its last day, from efforts open then.</p>
      </Card>
    </section>
  );
}

function mapPoints(d: ProgrammeNumbers, kind: string): MapPoint[] {
  return d.rows.filter((r) => r.lat !== null && r.lng !== null).map((r) => {
    let weight = r.efforts.running + r.efforts.settingUp;
    let tone: MapPoint["tone"] = weight > 0 ? "green" : "grey";
    let label = `${r.efforts.running} running · ${r.efforts.settingUp} setting up`;
    if (kind === "count" && r.need) {
      weight = r.need.need;
      tone = r.need.need === 0 ? "grey" : r.need.remaining === 0 ? "green" : r.need.remaining < r.need.need ? "amber" : "red";
      label = `Need ${fmt(r.need.need)} · running ${r.efforts.running} · remaining ${fmt(r.need.remaining)}`;
    } else if (kind === "saturation") {
      const c = r.saturation?._all;
      const p = c ? pct(c.received, c.eligible) : null;
      weight = c?.eligible ?? 0;
      tone = p === null ? "grey" : p < 40 ? "red" : p < 75 ? "amber" : "green";
      label = p === null ? "No figures yet" : `${p}% saturated · ${fmt(c!.received)} of ${fmt(c!.eligible)}`;
    }
    return { id: r.id, name: r.name, lat: r.lat!, lng: r.lng!, weight: Math.max(weight, 0.5), tone, label, drill: r.hasChildren };
  });
}
