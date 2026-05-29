import Link from "next/link";
import { Library, Tags, Flag, Moon, Eye, EyeOff, Users, Inbox, AlertTriangle } from "lucide-react";

type Data = {
  tagFreq: { tagType: string; tagValue: string; count: number }[];
  mostFlagged: { id: string; slug: string; title: string; openFlagCount: number }[];
  dormant: {
    id: string;
    slug: string;
    title: string;
    lastEditedAt: string;
    owner: { name: string | null } | null;
  }[];
  orphanRate: number;
  orphanCount: number;
  totalCount: number;
  byType: { type: string; count: number }[];
  viewsLast30d: number;
  mostViewed: { id: string; slug: string; title: string; views: number }[];
  zeroViewPages: { id: string; slug: string; title: string }[];
  circles: {
    last30d: number;
    last6mo: number;
    withEditsLast30d: number;
    uniqueFacilitatorsLast6mo: number;
  };
  gaps: {
    openCount: number;
    oldestOpenAgeDays: number | null;
    publishedLast90d: number;
    declinedLast90d: number;
    publishMedianDays: number | null;
  };
  flagsBreaching30d: number;
  observationsLast30d: number;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CuratorDashboard({ data }: { data: Data }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-900 mb-3 inline-flex items-center gap-2">
        <Library className="w-4 h-4 text-stone-600" />
        Corpus overview
      </h2>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Live pages" value={data.totalCount} />
        <Stat
          label="Orphan rate"
          value={`${data.orphanRate}%`}
          subtitle={`${data.orphanCount} of ${data.totalCount}`}
        />
        <Stat label="Views (last 30d)" value={data.viewsLast30d} />
        <Stat
          label="By type"
          value={data.byType.map((t) => `${t.count} ${t.type}`).join(" · ")}
          textValue
        />
      </div>

      {/* ── Practice circles health ────────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-stone-900 mb-3 inline-flex items-center gap-2">
        <Users className="w-4 h-4 text-stone-600" />
        Practice circles &amp; observations
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat
          label="Circles last 30d"
          value={data.circles.last30d}
          subtitle={`${data.circles.last6mo} in last 6 months`}
        />
        <Stat
          label="… with page edits"
          value={data.circles.withEditsLast30d}
          subtitle={
            data.circles.last30d > 0
              ? `${Math.round((data.circles.withEditsLast30d / data.circles.last30d) * 100)}% — target ≥ 80%`
              : "no circles yet"
          }
        />
        <Stat
          label="Unique facilitators (6mo)"
          value={data.circles.uniqueFacilitatorsLast6mo}
          subtitle="target ≥ 3 after owner months 1–3"
        />
        <Stat
          label="Observations last 30d"
          value={data.observationsLast30d}
          subtitle="shadows + onboarding"
        />
      </div>

      {/* ── Gap queue + flag SLA ───────────────────────────────────────── */}
      <h2 className="text-lg font-semibold text-stone-900 mb-3 inline-flex items-center gap-2">
        <Inbox className="w-4 h-4 text-stone-600" />
        Gap queue &amp; SLA
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat
          label="Open gaps"
          value={data.gaps.openCount}
          subtitle={
            data.gaps.openCount === 0
              ? "—"
              : data.gaps.openCount > 20
              ? "above target (≤ 20)"
              : "within target"
          }
        />
        <Stat
          label="Oldest open age"
          value={data.gaps.oldestOpenAgeDays === null ? "—" : `${data.gaps.oldestOpenAgeDays}d`}
          subtitle="target ≤ 14d"
        />
        <Stat
          label="Gap→publish median"
          value={data.gaps.publishMedianDays === null ? "—" : `${data.gaps.publishMedianDays}d`}
          subtitle={`${data.gaps.publishedLast90d} published, ${data.gaps.declinedLast90d} declined (90d)`}
        />
        <Stat
          label="Flags &gt; 30d unresolved"
          value={data.flagsBreaching30d}
          subtitle={data.flagsBreaching30d === 0 ? "clean" : <span className="text-rose-700 font-medium">SLA breached</span>}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Most-viewed (last 30d)" icon={<Eye className="w-4 h-4 text-sky-700" />}>
          {data.mostViewed.length === 0 ? (
            <Empty>No views recorded yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.mostViewed.map((p) => (
                <li key={p.id} className="px-3 py-2 flex items-center justify-between text-sm">
                  <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate">
                    {p.title}
                  </Link>
                  <span className="text-xs text-sky-700">{p.views}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Zero-view pages (live ≥30d)" icon={<EyeOff className="w-4 h-4 text-stone-500" />}>
          {data.zeroViewPages.length === 0 ? (
            <Empty>Every page has been read at least once.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
              {data.zeroViewPages.map((p) => (
                <li key={p.id} className="px-3 py-2 text-sm">
                  <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate block">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Most-flagged pages" icon={<Flag className="w-4 h-4 text-amber-700" />}>
          {data.mostFlagged.length === 0 ? (
            <Empty>No open flags right now.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {data.mostFlagged.map((p) => (
                <li key={p.id} className="px-3 py-2 flex items-center justify-between text-sm">
                  <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate">
                    {p.title}
                  </Link>
                  <span className="text-xs text-amber-700">{p.openFlagCount}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Dormant (no edits in 60d)" icon={<Moon className="w-4 h-4 text-stone-500" />}>
          {data.dormant.length === 0 ? (
            <Empty>Nothing dormant.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
              {data.dormant.map((p) => (
                <li key={p.id} className="px-3 py-2 flex items-center justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate block">
                      {p.title}
                    </Link>
                    <span className="text-xs text-stone-500">
                      {p.owner?.name ?? "Unowned"} · last edited {fmtDate(p.lastEditedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Tag frequency" icon={<Tags className="w-4 h-4 text-indigo-700" />}>
          {data.tagFreq.length === 0 ? (
            <Empty>No tags yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
              {data.tagFreq.map((t) => (
                <li key={`${t.tagType}:${t.tagValue}`} className="px-3 py-2 flex items-center justify-between text-sm">
                  <span className="text-stone-700">
                    <span className="text-stone-500">{t.tagType}:</span> {t.tagValue}
                  </span>
                  <span className="text-xs text-stone-500">{t.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  subtitle,
  textValue,
}: {
  label: string;
  value: number | string;
  subtitle?: React.ReactNode;
  textValue?: boolean;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg px-3 py-2">
      <div className={textValue ? "text-sm font-medium text-stone-800" : "text-2xl font-semibold text-stone-900"}>
        {value}
      </div>
      <div className="text-xs uppercase tracking-wide text-stone-500">{label}</div>
      {subtitle && <div className="text-xs text-stone-400 mt-0.5">{subtitle}</div>}
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-1.5 text-sm font-medium text-stone-800">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm text-stone-500">{children}</p>;
}
