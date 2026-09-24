import Link from "next/link";
import prisma from "@/lib/prisma";
import type { Prisma, ScreeningStatus } from "@/app/generated/prisma/client";
import { visibleWhere, canLead } from "@/lib/seeding/screening/access";
import { FLAG_META, STATUS_META } from "@/lib/seeding/screening/decide";
import { bandOf, BAND_META, screeningSettings } from "@/lib/seeding/screening/rubric";
import { Chip } from "../_components/bits";
import ScreeningNav from "./_components/ScreeningNav";
import StartDraftsButton from "./_components/StartDraftsButton";
import { aiTotal, pageAccess, rubricCache } from "./_lib/load";

export const dynamic = "force-dynamic";

const PAGE = 50;
const STATUSES = Object.keys(STATUS_META) as ScreeningStatus[];

type SP = Record<string, string | undefined>;

export default async function ScreeningQueuePage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await pageAccess();
  if (!s) {
    return (
      <div className="max-w-xl">
        <h1 className="text-xl font-semibold text-stone-900">Screening</h1>
        <p className="text-sm text-stone-500 mt-2">
          Screening is open to geography coordinators, geo POCs, geography leads and the central team. Ask a programme lead
          to add you under Members.
        </p>
      </div>
    );
  }
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const geos = await prisma.seedingGeo.findMany({ orderBy: { sortOrder: "asc" } });
  const myGeos = s.all ? geos : geos.filter((g) => s.screenGeoIds.includes(g.id));
  const geo = myGeos.find((g) => g.key === sp.geo) ?? null;

  const base: Prisma.ScreeningApplicationWhereInput = {
    AND: [visibleWhere(s), geo ? { geoId: geo.id } : {}],
  };
  const filters: Prisma.ScreeningApplicationWhereInput[] = [base];
  if (sp.status && STATUSES.includes(sp.status as ScreeningStatus)) filters.push({ status: sp.status as ScreeningStatus });
  if (sp.flag) filters.push({ flags: { has: sp.flag } });
  if (sp.theme) filters.push({ theme: sp.theme });
  if (sp.criteria === "below") filters.push({ NOT: { criteriaFlags: { equals: [] } } });
  if (sp.q) {
    const q = sp.q.trim();
    filters.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { ref: { contains: q, mode: "insensitive" } },
        { district: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (sp.todo === "1") {
    // What this person can act on now: unread by them at L2, or waiting on them as lead.
    const leadGeoIds = s.leadAll ? undefined : s.leadGeoIds;
    filters.push({
      OR: [
        { status: { in: ["new", "l2_hold"] }, NOT: { reviews: { some: { reviewerId: s.userId, level: "l2" } } } },
        { status: { in: ["l3_pending", "l3_hold"] }, ...(leadGeoIds ? { geoId: { in: leadGeoIds } } : {}) },
      ],
    });
  }
  const where: Prisma.ScreeningApplicationWhereInput = { AND: filters };

  const [apps, total, byStatus, themes, draftStats, settings, mineToday, safeguarding] = await Promise.all([
    prisma.screeningApplication.findMany({
      where,
      orderBy: [{ submittedAt: "asc" }, { createdAt: "asc" }],
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { geo: true, reviews: { select: { level: true, total: true } } },
    }),
    prisma.screeningApplication.count({ where }),
    prisma.screeningApplication.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.screeningApplication.findMany({ where: base, distinct: ["theme"], select: { theme: true } }),
    prisma.screeningApplication.groupBy({ by: ["aiStatus"], where: base, _count: true }),
    screeningSettings(),
    prisma.screeningReview.count({
      where: { reviewerId: s.userId, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
    // Open safeguarding concerns, for the central team: anything flagged and not yet decided.
    s.all
      ? prisma.screeningApplication.count({
          where: { flags: { has: "safeguarding" }, status: { notIn: ["approved", "rejected"] } },
        })
      : Promise.resolve(0),
  ]);

  const rubric = rubricCache();
  const rows = await Promise.all(
    apps.map(async (a) => {
      const r = await rubric(a.geo?.key ?? null);
      const l2 = a.reviews.filter((x) => x.level === "l2" && x.total !== null).map((x) => x.total!);
      return {
        a,
        ai: aiTotal(r, a.aiDraft, a.isGroup),
        l2: l2.length ? Math.round((l2.reduce((n, t) => n + t, 0) / l2.length) * 10) / 10 : null,
      };
    }),
  );

  const count = (st: ScreeningStatus) => byStatus.find((b) => b.status === st)?._count ?? 0;
  const ai = (k: string) => draftStats.find((d) => d.aiStatus === k)?._count ?? 0;
  const href = (patch: SP) => {
    const next: SP = { ...sp, ...patch, page: undefined };
    const qs = Object.entries(next).filter((e): e is [string, string] => !!e[1]);
    return `/seeding/screening${qs.length ? "?" + new URLSearchParams(qs).toString() : ""}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Screening</h1>
          <p className="text-sm text-stone-500">
            Applications to The Social Startup Programme, scored against each geography&apos;s rubric.
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-xs ${mineToday >= settings.dailyCap ? "text-amber-700" : "text-stone-500"}`}>
            You have reviewed {mineToday} today · daily limit {settings.dailyCap}
          </p>
        </div>
      </div>
      <ScreeningNav active="queue" canImport={s.all || s.canConfigure} canConfigure={s.canConfigure} />

      {safeguarding > 0 && (
        <Link
          href="/seeding/screening?flag=safeguarding"
          className="mb-4 block rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 hover:border-rose-400"
        >
          {safeguarding} open safeguarding {safeguarding === 1 ? "concern" : "concerns"} — review now
        </Link>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        <Tab href={href({ geo: undefined })} on={!geo} label="All geographies" />
        {myGeos.map((g) => (
          <Tab key={g.id} href={href({ geo: g.key })} on={geo?.id === g.id} label={g.label} />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-4">
        {STATUSES.map((st) => (
          <Link
            key={st}
            href={href({ status: sp.status === st ? undefined : st })}
            className={`rounded-lg border px-3 py-2 ${sp.status === st ? "border-stone-800 bg-white" : "border-stone-200 bg-white hover:border-stone-300"}`}
          >
            <p className="text-lg font-semibold text-stone-900 tabular-nums">{count(st)}</p>
            <p className="text-[11px] text-stone-500">{STATUS_META[st].label}</p>
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2 mb-3" action="/seeding/screening">
        {geo && <input type="hidden" name="geo" value={geo.key} />}
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Name, email, reference or district"
          className="rounded border border-stone-300 px-2 py-1.5 text-sm w-64"
        />
        <select name="theme" defaultValue={sp.theme ?? ""} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
          <option value="">All themes</option>
          {themes
            .map((t) => t.theme)
            .filter((t): t is string => !!t)
            .sort()
            .map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
        <select name="flag" defaultValue={sp.flag ?? ""} className="rounded border border-stone-300 px-2 py-1.5 text-sm">
          <option value="">Any flags</option>
          {Object.entries(FLAG_META).map(([k, m]) => (
            <option key={k} value={k}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-stone-600">
          <input type="checkbox" name="criteria" value="below" defaultChecked={sp.criteria === "below"} /> Below stated criteria
        </label>
        <label className="flex items-center gap-1 text-xs text-stone-600">
          <input type="checkbox" name="todo" value="1" defaultChecked={sp.todo === "1"} /> Waiting on me
        </label>
        <button className="rounded bg-stone-900 px-3 py-1.5 text-xs text-white hover:bg-stone-700">Filter</button>
        {Object.keys(sp).length > 0 && (
          <Link href="/seeding/screening" className="text-xs text-sky-600 hover:underline">
            Clear
          </Link>
        )}
      </form>

      {(ai("pending") > 0 || ai("running") > 0 || ai("failed") > 0) && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600">
          <span>
            First reads: {ai("running")} in progress · {ai("pending")} waiting
            {ai("failed") > 0 ? ` · ${ai("failed")} failed` : ""}
          </span>
          <StartDraftsButton />
        </div>
      )}

      <div className="rounded-xl border border-stone-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-[11px] uppercase tracking-wide text-stone-500">
            <tr>
              <th className="text-left font-medium px-3 py-2">Applicant</th>
              <th className="text-left font-medium px-3 py-2">Geography · district</th>
              <th className="text-left font-medium px-3 py-2">Theme</th>
              <th className="text-right font-medium px-3 py-2">First read</th>
              <th className="text-right font-medium px-3 py-2">L2 score</th>
              <th className="text-left font-medium px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(({ a, ai: aiT, l2 }) => (
              <tr key={a.id} className="hover:bg-stone-50">
                <td className="px-3 py-2">
                  <Link href={`/seeding/screening/${a.id}`} className="text-stone-900 hover:text-sky-700 font-medium">
                    {a.name}
                  </Link>
                  <p className="text-[11px] text-stone-400">
                    {a.ref}
                    {a.isGroup ? " · group" : ""}
                  </p>
                </td>
                <td className="px-3 py-2 text-stone-600">
                  {a.geo?.label ?? <span className="text-amber-700">Unassigned</span>}
                  {a.district ? <span className="text-stone-400"> · {a.district}</span> : null}
                </td>
                <td className="px-3 py-2 text-stone-600">{a.theme ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-500">
                  {aiT !== null ? aiT.toFixed(0) : a.aiStatus === "failed" ? <span className="text-rose-600">failed</span> : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l2 !== null ? (
                    <span className={`px-1.5 py-0.5 rounded ${BAND_META[bandOf(l2, settings)].chip}`}>{l2.toFixed(0)}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Chip meta={STATUS_META[a.status]} />
                    {a.flags.map((f) => (FLAG_META[f] ? <Chip key={f} meta={FLAG_META[f]} /> : null))}
                    {(a.criteriaFlags as unknown[]).length > 0 && <Chip meta={{ label: "Below criteria", chip: "bg-stone-200 text-stone-700" }} />}
                    {a.status === "l3_pending" && canLead(s, a.geoId) && (
                      <span className="text-[11px] text-violet-700">your decision</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-stone-400">
                  No applications match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {total > PAGE && (
        <div className="flex items-center justify-between mt-3 text-xs text-stone-500">
          <span>
            {(page - 1) * PAGE + 1}–{Math.min(page * PAGE, total)} of {total}
          </span>
          <div className="flex gap-3">
            {page > 1 && (
              <Link href={`${href({})}${href({}).includes("?") ? "&" : "?"}page=${page - 1}`} className="text-sky-600 hover:underline">
                Previous
              </Link>
            )}
            {page * PAGE < total && (
              <Link href={`${href({})}${href({}).includes("?") ? "&" : "?"}page=${page + 1}`} className="text-sky-600 hover:underline">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({ href, on, label }: { href: string; on: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs ${on ? "bg-stone-900 text-white" : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300"}`}
    >
      {label}
    </Link>
  );
}
