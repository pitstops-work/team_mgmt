import Link from "next/link";
import {
  ShieldCheck,
  AlertCircle,
  Clock,
  Flag,
  ArrowRightLeft,
  History,
} from "lucide-react";

type PageRef = { id: string; slug: string; title: string };

type Data = {
  orphaned: (PageRef & { type: string; lastEditedAt: string })[];
  overdue: (PageRef & {
    status: string;
    nextReviewDue: string | null;
    owner: { id: string; name: string | null } | null;
  })[];
  termExpiring: (PageRef & {
    ownerTermEnd: string | null;
    owner: { id: string; name: string | null } | null;
  })[];
  underReview: (PageRef & { owner: { id: string; name: string | null } | null })[];
  recentFlags: {
    id: string;
    reason: string;
    createdAt: string;
    flagger: { name: string | null };
    page: { slug: string; title: string };
  }[];
  pendingHandovers: {
    id: string;
    handoverNote: string | null;
    createdAt: string;
    page: { slug: string; title: string };
    fromUser: { name: string | null };
    toUser: { name: string | null };
  }[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysFromNow(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

export default function StewardDashboard({ data }: { data: Data }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-900 mb-3 inline-flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-stone-600" />
        Steward queue
      </h2>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat tone="amber" label="Orphaned" count={data.orphaned.length} />
        <Stat tone="red" label="Overdue review" count={data.overdue.length} />
        <Stat tone="indigo" label="Term ≤30d" count={data.termExpiring.length} />
        <Stat tone="red" label="Under review" count={data.underReview.length} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <PageGroup
          title="Orphaned"
          icon={<AlertCircle className="w-4 h-4 text-amber-700" />}
          empty="No orphans."
        >
          {data.orphaned.map((p) => (
            <Row key={p.id}>
              <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate">
                {p.title}
              </Link>
              <span className="text-xs text-stone-500">{fmtDate(p.lastEditedAt)}</span>
            </Row>
          ))}
        </PageGroup>

        <PageGroup
          title="Overdue review"
          icon={<AlertCircle className="w-4 h-4 text-red-700" />}
          empty="None overdue."
        >
          {data.overdue.map((p) => {
            const days = daysFromNow(p.nextReviewDue);
            return (
              <Row key={p.id}>
                <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate">
                  {p.title}
                </Link>
                <span className="text-xs text-red-700">
                  {days !== null && days < 0 ? `${Math.abs(days)}d` : "—"}
                </span>
              </Row>
            );
          })}
        </PageGroup>

        <PageGroup
          title="Term expiring soon"
          icon={<Clock className="w-4 h-4 text-indigo-700" />}
          empty="No terms expiring in 30d."
        >
          {data.termExpiring.map((p) => {
            const days = daysFromNow(p.ownerTermEnd);
            return (
              <Row key={p.id}>
                <div className="min-w-0 flex-1">
                  <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate block">
                    {p.title}
                  </Link>
                  <div className="text-xs text-stone-500">{p.owner?.name}</div>
                </div>
                <span className="text-xs text-indigo-700 shrink-0">in {days}d</span>
              </Row>
            );
          })}
        </PageGroup>

        <PageGroup
          title="Under review"
          icon={<History className="w-4 h-4 text-red-700" />}
          empty="None."
        >
          {data.underReview.map((p) => (
            <Row key={p.id}>
              <div className="min-w-0 flex-1">
                <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline truncate block">
                  {p.title}
                </Link>
                <div className="text-xs text-stone-500">{p.owner?.name ?? "Unowned"}</div>
              </div>
            </Row>
          ))}
        </PageGroup>

        <PageGroup
          title="Pending handovers"
          icon={<ArrowRightLeft className="w-4 h-4 text-sky-700" />}
          empty="None pending."
        >
          {data.pendingHandovers.map((h) => (
            <Row key={h.id}>
              <div className="min-w-0 flex-1">
                <Link href={`/wiki/${h.page.slug}`} className="text-stone-900 hover:underline truncate block">
                  {h.page.title}
                </Link>
                <div className="text-xs text-stone-500">
                  {h.fromUser.name} → {h.toUser.name}
                </div>
              </div>
              <span className="text-xs text-stone-500">{fmtDate(h.createdAt)}</span>
            </Row>
          ))}
        </PageGroup>

        <PageGroup
          title="Recent open flags"
          icon={<Flag className="w-4 h-4 text-amber-700" />}
          empty="No open flags."
        >
          {data.recentFlags.map((f) => (
            <Row key={f.id}>
              <div className="min-w-0 flex-1">
                <Link href={`/wiki/${f.page.slug}`} className="text-stone-900 hover:underline truncate block">
                  {f.page.title}
                </Link>
                <div className="text-xs text-stone-500 truncate">
                  {f.flagger.name} · {f.reason}
                </div>
              </div>
              <span className="text-xs text-stone-500 shrink-0">{fmtDate(f.createdAt)}</span>
            </Row>
          ))}
        </PageGroup>
      </div>
    </section>
  );
}

function Stat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "red" | "indigo" | "amber";
}) {
  const cls =
    tone === "red"
      ? "bg-red-50 border-red-200 text-red-700"
      : tone === "indigo"
        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
        : "bg-amber-50 border-amber-200 text-amber-700";
  return (
    <div className={`border rounded-lg px-3 py-2 ${count > 0 ? cls : "bg-white border-stone-200 text-stone-400"}`}>
      <div className="text-2xl font-semibold">{count}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </div>
  );
}

function PageGroup({
  title,
  icon,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const hasContent = arr.filter(Boolean).length > 0;
  return (
    <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-stone-100 flex items-center gap-1.5 text-sm font-medium text-stone-800">
        {icon}
        {title}
      </div>
      {hasContent ? (
        <ul className="divide-y divide-stone-100 max-h-80 overflow-y-auto">{children}</ul>
      ) : (
        <p className="px-3 py-4 text-sm text-stone-500">{empty}</p>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="px-3 py-2 flex items-center justify-between gap-2 text-sm">{children}</li>;
}
