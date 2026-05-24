import Link from "next/link";
import { BookOpen, Flag, MessageCircle, AlertCircle, Clock } from "lucide-react";

type Page = {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  lastEditedAt: string;
  nextReviewDue: string | null;
  ownerTermEnd: string | null;
  _count: { flags: number; comments: number };
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

export default function OwnerDashboard({ pages }: { pages: Page[] }) {
  const overdue = pages.filter(
    (p) => p.nextReviewDue && new Date(p.nextReviewDue) < new Date(),
  );
  const termSoon = pages.filter((p) => {
    const d = daysFromNow(p.ownerTermEnd);
    return d !== null && d >= 0 && d <= 30;
  });
  const needsAttention = pages.filter((p) => p._count.flags > 0 || p._count.comments > 0);

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-900 mb-3 inline-flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-stone-600" />
        Your pages
      </h2>

      {(overdue.length > 0 || termSoon.length > 0 || needsAttention.length > 0) && (
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <CalloutCard
            label="Overdue review"
            count={overdue.length}
            tone={overdue.length > 0 ? "red" : "muted"}
          />
          <CalloutCard
            label="Term ending ≤30d"
            count={termSoon.length}
            tone={termSoon.length > 0 ? "indigo" : "muted"}
          />
          <CalloutCard
            label="Flags + comments to act on"
            count={needsAttention.reduce(
              (sum, p) => sum + p._count.flags + p._count.comments,
              0,
            )}
            tone={needsAttention.length > 0 ? "amber" : "muted"}
          />
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="text-left px-3 py-2">Title</th>
              <th className="text-left px-2 py-2 hidden sm:table-cell">Type</th>
              <th className="text-right px-2 py-2">Flags</th>
              <th className="text-right px-2 py-2">Comments</th>
              <th className="text-left px-2 py-2">Next review</th>
              <th className="text-left px-3 py-2 hidden md:table-cell">Term ends</th>
            </tr>
          </thead>
          <tbody>
            {pages.map((p) => {
              const reviewDays = daysFromNow(p.nextReviewDue);
              const overdue = reviewDays !== null && reviewDays < 0;
              const termDays = daysFromNow(p.ownerTermEnd);
              const termSoon = termDays !== null && termDays >= 0 && termDays <= 30;
              return (
                <tr key={p.id} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="px-3 py-2">
                    <Link href={`/wiki/${p.slug}`} className="text-stone-900 hover:underline">
                      {p.title}
                    </Link>
                    {p.status !== "published" && (
                      <span className="ml-2 text-xs text-stone-500">({p.status})</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-stone-500 hidden sm:table-cell">{p.type}</td>
                  <td className="px-2 py-2 text-right">
                    {p._count.flags > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-700">
                        <Flag className="w-3 h-3" />
                        {p._count.flags}
                      </span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {p._count.comments > 0 ? (
                      <span className="inline-flex items-center gap-1 text-stone-700">
                        <MessageCircle className="w-3 h-3" />
                        {p._count.comments}
                      </span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className={`px-2 py-2 ${overdue ? "text-red-600 font-medium" : "text-stone-600"}`}>
                    {overdue ? (
                      <span className="inline-flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {Math.abs(reviewDays!)}d ago
                      </span>
                    ) : reviewDays !== null ? (
                      `in ${reviewDays}d`
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`px-3 py-2 hidden md:table-cell ${termSoon ? "text-indigo-700" : "text-stone-500"}`}>
                    {termDays !== null ? (
                      <span className="inline-flex items-center gap-1">
                        {termSoon && <Clock className="w-3 h-3" />}
                        in {termDays}d
                      </span>
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CalloutCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "red" | "indigo" | "amber" | "muted";
}) {
  const toneCls =
    tone === "red"
      ? "bg-red-50 border-red-200 text-red-700"
      : tone === "indigo"
        ? "bg-indigo-50 border-indigo-200 text-indigo-700"
        : tone === "amber"
          ? "bg-amber-50 border-amber-200 text-amber-700"
          : "bg-white border-stone-200 text-stone-400";
  return (
    <div className={`border rounded-lg px-3 py-2 ${toneCls}`}>
      <div className="text-2xl font-semibold">{count}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </div>
  );
}
