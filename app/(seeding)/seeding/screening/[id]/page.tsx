import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { canLead, canSee } from "@/lib/seeding/screening/access";
import { FLAG_META, levelFor, STATUS_META, DECISION_LABEL, type Decision } from "@/lib/seeding/screening/decide";
import { activeDimensions, rubricFor, screeningSettings, type Dimension } from "@/lib/seeding/screening/rubric";
import type { AiDraft, Answer, Doc } from "@/lib/seeding/screening/draft";
import { Chip } from "../../_components/bits";
import { pageAccess } from "../_lib/load";
import ScoringPanel from "./ScoringPanel";
import ApplicationActions from "./ApplicationActions";

export const dynamic = "force-dynamic";

const DOC_LABEL: Record<string, string> = {
  cv: "CV",
  sop: "Statement of purpose",
  photo: "Photograph",
  class10: "Class 10 certificate",
  degree: "Graduation certificate",
  experience: "Experience certificate",
  other: "Document",
};

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await pageAccess();
  const { id } = await params;
  const app = s
    ? await prisma.screeningApplication.findUnique({
        where: { id },
        include: {
          geo: true,
          reviews: { orderBy: { createdAt: "asc" }, include: { reviewer: { select: { id: true, name: true } } } },
          events: { orderBy: { createdAt: "desc" }, take: 40, include: { actor: { select: { name: true } } } },
        },
      })
    : null;
  if (!s || !app || !canSee(s, app)) notFound();

  const [rubric, settings] = await Promise.all([rubricFor(app.geo?.key ?? null), screeningSettings()]);
  const dims: Dimension[] = activeDimensions(rubric.dimensions, app.isGroup);
  const level = levelFor(app.status);
  const l2Mine = app.reviews.some((r) => r.level === "l2" && r.reviewerId === s.userId);
  const canAct =
    level === "l2" ? !(app.status === "l2_hold" && l2Mine) && !(app.status === "new" && l2Mine) : level === "l3" ? canLead(s, app.geoId) : false;
  const whyNot =
    level === "l2" && l2Mine
      ? "You have already read this application. A held application needs a second read by a different screener."
      : level === "l3" && !canLead(s, app.geoId)
        ? "Shortlisted — waiting on the geography lead."
        : level === null
          ? `Decided: ${STATUS_META[app.status].label.toLowerCase()}.`
          : null;

  const profile = Object.entries((app.profile ?? {}) as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== "",
  );
  const answers = (app.answers ?? []) as Answer[];
  const docs = (app.documents ?? []) as Doc[];
  const members = (app.members ?? []) as Record<string, unknown>[];
  const criteria = (app.criteriaFlags ?? []) as { criterion: string; detail?: string }[];
  const draft = app.aiDraft as AiDraft | null;

  return (
    <div>
      <Link href="/seeding/screening" className="text-xs text-stone-500 hover:text-stone-800">
        ← Applications
      </Link>
      <div className="flex flex-wrap items-start gap-3 mt-2 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{app.name}</h1>
          <p className="text-sm text-stone-500">
            {app.ref} · {app.geo?.label ?? "No geography"}
            {app.district ? ` · ${[app.block, app.district, app.state].filter(Boolean).join(", ")}` : ""}
            {app.theme ? ` · ${app.theme}` : ""} · {app.isGroup ? (members.length ? `group of ${members.length + 1}` : "group") : "individual"}
          </p>
          <p className="text-[11px] text-stone-400 mt-0.5">
            {app.email}
            {app.phone ? ` · ${app.phone}` : ""}
            {app.submittedAt ? ` · submitted ${app.submittedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-1">
          <Chip meta={STATUS_META[app.status]} />
          {app.flags.map((f) => (FLAG_META[f] ? <Chip key={f} meta={FLAG_META[f]} /> : null))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-4 min-w-0">
          {criteria.length > 0 && (
            <Section title="Below the stated criteria">
              <ul className="px-4 py-3 text-sm text-stone-700 list-disc pl-8 space-y-0.5">
                {criteria.map((c, i) => (
                  <li key={i}>
                    {c.criterion}
                    {c.detail ? <span className="text-stone-500"> — {c.detail}</span> : null}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {draft && (
            <Section title="First read (AI draft — advisory)">
              <div className="px-4 py-3 text-sm text-stone-700 space-y-2">
                <p>{draft.summary}</p>
                {draft.concerns?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">To check</p>
                    <ul className="list-disc pl-5 text-stone-600">
                      {draft.concerns.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {app.aiRubricVersion !== null && app.aiRubricVersion !== rubric.version && (
                  <p className="text-[11px] text-amber-700">Drafted against an earlier version of the rubric.</p>
                )}
              </div>
            </Section>
          )}
          {!draft && (
            <p className="text-xs text-stone-500 rounded-lg border border-stone-200 bg-white px-3 py-2">
              {app.aiStatus === "failed"
                ? `The first read failed: ${app.aiError ?? "unknown error"}`
                : app.aiStatus === "off"
                  ? "First reads are switched off in Settings."
                  : "The first read hasn't run yet. You can score without it."}
            </p>
          )}

          {answers.length > 0 && (
            <Section title="Written answers">
              <div className="divide-y divide-stone-100">
                {answers.map((a) => (
                  <div key={a.key} className="px-4 py-3">
                    <p className="text-xs font-medium text-stone-600">{a.label}</p>
                    <p className="mt-1 text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">{a.text || "—"}</p>
                    <p className="mt-1 text-[11px] text-stone-400">{words(a.text)} words</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {app.sopText && (
            <Section title="Statement of purpose">
              <p className="px-4 py-3 text-sm text-stone-800 whitespace-pre-wrap leading-relaxed">{app.sopText}</p>
            </Section>
          )}

          {profile.length > 0 && (
            <Section title="Form answers">
              <dl className="divide-y divide-stone-100">
                {profile.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2 text-sm">
                    <dt className="text-stone-500">{k}</dt>
                    <dd className="text-stone-800 whitespace-pre-wrap">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {members.length > 0 && (
            <Section title="Group members">
              <div className="divide-y divide-stone-100">
                {members.map((m, i) => (
                  <dl key={i} className="px-4 py-2 text-sm grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-0.5">
                    {Object.entries(m).map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="text-stone-500">{k}</dt>
                        <dd className="text-stone-800">{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                ))}
              </div>
            </Section>
          )}

          <Section title="Documents">
            <ul className="px-4 py-3 text-sm space-y-1">
              {docs.map((d, i) => (
                <li key={i}>
                  <a href={`/api/seeding/screening/${app.id}/doc?i=${i}`} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">
                    {DOC_LABEL[d.kind] ?? d.kind}
                  </a>
                  <span className="text-[11px] text-stone-400"> · {d.name}</span>
                </li>
              ))}
              {docs.length === 0 && <li className="text-stone-400">No documents attached.</li>}
            </ul>
            {app.cvText && (
              <details className="border-t border-stone-100">
                <summary className="px-4 py-2 text-xs text-stone-500 cursor-pointer">CV text</summary>
                <p className="px-4 pb-3 text-xs text-stone-700 whitespace-pre-wrap leading-relaxed">{app.cvText}</p>
              </details>
            )}
          </Section>

          <Section title="Reviews">
            <div className="divide-y divide-stone-100">
              {app.reviews.map((r) => (
                <div key={r.id} className="px-4 py-2.5 text-sm">
                  <p className="text-stone-800">
                    <span className="font-medium">{r.level.toUpperCase()}</span> · {r.reviewer?.name ?? "Former member"} ·{" "}
                    {DECISION_LABEL[r.decision as Decision] ?? r.decision}
                    {r.total !== null ? ` · ${r.total.toFixed(0)}/100` : ""}
                  </p>
                  <p className="text-stone-600">{r.justification}</p>
                  <p className="text-[11px] text-stone-400">{r.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
              ))}
              {app.reviews.length === 0 && <p className="px-4 py-3 text-sm text-stone-400">Not reviewed yet.</p>}
            </div>
          </Section>

          <details className="rounded-xl border border-stone-200 bg-white">
            <summary className="px-4 py-2.5 text-sm font-medium text-stone-700 cursor-pointer">History</summary>
            <ul className="px-4 pb-3 text-[11px] text-stone-500 space-y-0.5">
              {app.events.map((e) => (
                <li key={e.id}>
                  {e.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} · {e.actor?.name ?? "System"} ·{" "}
                  {e.type.replace(/_/g, " ")}
                  {e.detail && typeof e.detail === "object" && "note" in e.detail && e.detail.note ? ` — ${String(e.detail.note)}` : ""}
                </li>
              ))}
            </ul>
          </details>
        </div>

        <div className="lg:sticky lg:top-4 self-start space-y-3">
          <ScoringPanel
            applicationId={app.id}
            dims={dims.map((d) => ({ key: d.key, label: d.label, description: d.description, anchors: d.anchors, weight: app.isGroup ? d.groupWeight : d.weight }))}
            ai={draft?.scores ?? null}
            priorReviews={app.reviews
              .filter((r) => r.level === "l2")
              .map((r) => ({ name: r.reviewer?.name ?? "Screener", scores: r.scores as Record<string, number> }))}
            level={level}
            canAct={canAct}
            whyNot={whyNot}
            bands={{ advanceMin: settings.advanceMin, holdMin: settings.holdMin }}
            isSecondRead={app.status === "l2_hold"}
          />
          <ApplicationActions
            applicationId={app.id}
            flags={app.flags}
            isLead={canLead(s, app.geoId)}
            decided={level === null}
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200 bg-white overflow-hidden">
      <h2 className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-sm font-medium text-stone-700">{title}</h2>
      {children}
    </section>
  );
}
