import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSchoolPlanAccess, canViewPlan, canEditPlan } from "@/lib/schoolPlan/access";
import {
  PlanStatusChip, DeviationChip, ProgressBar, inr, Placeholder,
} from "../_shared";
import {
  computeSchoolRecurringY1, computeStandardRecurringY1,
  computeDeviationPct, computeSpaceCapacity, capacityShortfall,
  computeCostPerChildPerYear,
} from "@/lib/schoolPlan/rules";
import {
  STANDARD_SALARY, STANDARD_TRAVEL, STANDARD_PROGRAMME,
  STANDARD_TOTALS_Y1, DEVIATION_THRESHOLD_PCT, STANDARD_UNIT_COST_PER_CHILD_PER_YEAR,
} from "@/lib/schoolPlan/standards";
import { planCompleteness } from "@/lib/schoolPlan/completeness";
import { SCHOOL_PLAN_STEPS, SERVICE_ITEMS, PROGRAMME_COMPONENTS } from "@/lib/schoolPlan/stepTemplate";
import { loadPlanForCompleteness } from "../actions";
import type { SchoolPlanStepStatusValue } from "@/lib/schoolPlan/types";
import CatchmentMap from "./_components/CatchmentMap";

const STANDARD_RECURRING = computeStandardRecurringY1(
  [...STANDARD_SALARY, ...STANDARD_TRAVEL, ...STANDARD_PROGRAMME].map((l) => ({
    itemKey: l.itemKey, unitCost: l.unitCost, scaleUnits: l.units,
  })),
);

function SectionBar({ n, title, ready }: { n: string; title: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between bg-[#1F3A5F] text-white px-4 py-2 rounded-t-xl mt-8">
      <div className="text-sm font-semibold tracking-wide">§{n} · {title}</div>
      <div className={`text-[10px] px-2 py-0.5 rounded-full ${ready ? "bg-emerald-500/30 text-emerald-50" : "bg-white/10 text-white/60"}`}>
        {ready ? "Ready" : "Incomplete"}
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-stone-500 shrink-0 min-w-[140px]">{k}</span>
      <span className="text-stone-800">{v}</span>
    </div>
  );
}

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const access = await getSchoolPlanAccess(session);
  if (!canViewPlan(access, id)) redirect("/schools");

  const plan = await prisma.schoolPlan.findUnique({
    where: { id },
    include: {
      ourLead: { select: { name: true, email: true } },
      anchorPartner: { select: { name: true, city: true } },
      steps: { orderBy: { stepNo: "asc" } },
      settlements: { orderBy: { sortOrder: "asc" } },
      spaces: { orderBy: { sortOrder: "asc" } },
      services: true,
      components: { orderBy: { sortOrder: "asc" } },
      staffing: { orderBy: { sortOrder: "asc" } },
      milestones: { orderBy: { sortOrder: "asc" } },
      risks: { orderBy: { sortOrder: "asc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
      signoff: { include: {} },
      budget: {
        select: {
          id: true, name: true,
          lines: { select: { section: true, y1Total: true, templateKey: true } },
        },
      },
    },
  });
  if (!plan) notFound();
  const anchorLabel = plan.anchorPartner?.name ?? plan.anchorPartnerName;
  const seesSensitive = access.seesSensitive;

  const c = await loadPlanForCompleteness(id);
  const completeness = planCompleteness(c);

  const canEdit = canEditPlan(access, id);
  const schoolRecurring = computeSchoolRecurringY1(
    (plan.budget?.lines ?? []).map((l) => ({
      section: String(l.section), templateKey: l.templateKey, y1Total: l.y1Total,
    })),
  );
  const deviationPct = computeDeviationPct(schoolRecurring, STANDARD_RECURRING);
  const dailyCapacity = computeSpaceCapacity(plan.spaces);
  const shortfall = capacityShortfall(dailyCapacity, plan.targetChildrenPerDay);
  const totalEnrolment = (plan.enrolmentBoys ?? 0) + (plan.enrolmentGirls ?? 0);
  const artifactsByKind = plan.artifacts.reduce<Record<string, typeof plan.artifacts>>((m, a) => {
    (m[a.kind] ??= [] as typeof plan.artifacts).push(a); return m;
  }, {} as Record<string, typeof plan.artifacts>);
  const surveyDrawing = artifactsByKind["survey_drawing"]?.[0];
  const mapArtifact = artifactsByKind["map"]?.[0];

  const stepsByNo = new Map(plan.steps.map((s) => [s.stepNo, s]));
  const componentsByKey = new Map(plan.components.map((c) => [c.component, c]));
  const servicesByKey = new Map(plan.services.map((s) => [s.item, s]));

  return (
    <div className="space-y-2 pb-16">
      {/* Nav row */}
      <div className="flex items-center gap-2 text-xs text-stone-500">
        <Link href="/schools" className="hover:text-stone-700">← All plans</Link>
        <span className="mx-1">·</span>
        <Link href={`/schools/${id}/steps`} className="hover:text-stone-700">Steps</Link>
        <span className="mx-1">·</span>
        <Link href={`/schools/${id}/artifacts`} className="hover:text-stone-700">Artifacts</Link>
        {plan.budget && seesSensitive && (
          <>
            <span className="mx-1">·</span>
            <Link href={`/schools/${id}/budget`} className="hover:text-stone-700">Budget</Link>
          </>
        )}
        <span className="mx-1">·</span>
        <a href={`/api/schools/${id}/export.docx`} className="hover:text-stone-700">Export .docx</a>
        {plan.publicSlug && (
          <>
            <span className="mx-1">·</span>
            <a href={`/schools-public/${plan.publicSlug}`} target="_blank" rel="noopener" className="text-emerald-700 hover:text-emerald-800">Public view ↗</a>
          </>
        )}
        {canEdit && (
          <>
            <span className="mx-1">·</span>
            <Link href={`/schools/${id}/edit`} className="text-sky-600 hover:text-sky-800">Edit</Link>
          </>
        )}
      </div>

      {plan.isInterimStructure && (
        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          <b>Interim structure.</b> The Directorate has not yet constructed the school building. §3 uses an interim-structure spec in place of the as-built survey inventory.
        </div>
      )}

      {/* Cover — navy masthead */}
      <div className="rounded-2xl overflow-hidden mt-2">
        <div className="bg-[#1F3A5F] text-white px-5 py-6">
          <div className="text-[10px] uppercase tracking-widest text-white/60">
            After-School Centres · Directorate of Minorities · {plan.district ?? "Bangalore"}
          </div>
          <div className="text-2xl font-semibold mt-1">School Plan · {plan.name}</div>
          <div className="text-xs text-white/70 mt-1">{plan.officialName ?? <em className="text-white/40">— official name pending —</em>}</div>
          <div className="flex items-center gap-2 mt-3">
            <PlanStatusChip status={plan.planStatus} />
            <span className="text-[10px] text-white/60">Version {plan.planVersion}</span>
            <span className="text-[10px] text-white/60">· {completeness.readyCount}/10 sections ready</span>
          </div>
        </div>
        {/* Key stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-stone-100">
          <StatCard label="Enrolment" value={totalEnrolment > 0 ? totalEnrolment.toLocaleString("en-IN") : null} />
          <StatCard label="Teachers" value={plan.teachersWorking} />
          <StatCard label="Site (sq ft)" value={plan.siteAreaSqft?.toLocaleString("en-IN")} />
          <StatCard label="Children/day planned" value={plan.targetChildrenPerDay} />
        </div>
        {/* Deviation banner */}
        <div className="bg-[#E9EEF6] px-4 py-2 flex items-center gap-3 text-xs text-stone-700">
          <DeviationChip pct={deviationPct} />
          <span className="ml-auto">
            Recurring Y1: <b>{inr(schoolRecurring)}</b> vs standard {inr(STANDARD_TOTALS_Y1.recurringRupees)} · std ₹{STANDARD_UNIT_COST_PER_CHILD_PER_YEAR.toLocaleString("en-IN")}/child/yr
          </span>
        </div>
      </div>

      {/* Completeness tracker */}
      <div className="rounded-xl border border-stone-200 bg-white px-4 py-3 flex items-center gap-3">
        <div className="text-xs text-stone-500 whitespace-nowrap">Completeness</div>
        <div className="flex-1">
          <ProgressBar pct={(completeness.readyCount / 10) * 100} colorClass={completeness.ready ? "bg-emerald-500" : "bg-sky-500"} />
        </div>
        <div className="text-xs font-medium text-stone-700 whitespace-nowrap">{completeness.readyCount}/10</div>
      </div>

      {/* §1 School snapshot */}
      <SectionBar n="1" title="School snapshot" ready={completeness.sections[0].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">The school</div>
          <KV k="Name" v={plan.officialName ?? <Placeholder label="official name" />} />
          <KV k="Type" v={plan.schoolType ?? <Placeholder label="type" />} />
          <KV k="DISE code" v={plan.diseCode ?? <Placeholder label="dise code" />} />
          <KV k="Established" v={plan.yearEstablished ?? <Placeholder label="year" />} />
          <KV k="Grades" v={plan.grades ?? <Placeholder label="grades" />} />
          <KV k="Sections" v={plan.sections ?? <Placeholder label="sections" />} />
          <KV k="Medium(s)" v={plan.mediums.length ? plan.mediums.join(", ") : <Placeholder label="mediums" />} />
          <KV k="Enrolment (B/G)" v={plan.enrolmentBoys !== null && plan.enrolmentGirls !== null ? `${plan.enrolmentBoys} / ${plan.enrolmentGirls}` : <Placeholder label="enrolment" />} />
          <KV k="Teachers (sanctioned/working)" v={plan.teachersSanctioned !== null && plan.teachersWorking !== null ? `${plan.teachersSanctioned} / ${plan.teachersWorking}` : <Placeholder label="teachers" />} />
          <KV k="Timings" v={plan.timings ?? <Placeholder label="timings" />} />
          <KV k="Shifts" v={plan.shifts ?? <Placeholder label="shifts" />} />
          <KV k="Vacation months" v={plan.vacationMonths.length ? plan.vacationMonths.join(", ") : <Placeholder label="vacation months" />} />
          <KV k="Classrooms" v={plan.classroomsCount ?? <Placeholder label="classrooms" />} />
          <KV k="Other rooms" v={plan.otherRoomsCount ?? <Placeholder label="other rooms" />} />
        </div>
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">Site & administration</div>
          <KV k="Site area (sq ft)" v={plan.siteAreaSqft?.toLocaleString("en-IN") ?? <Placeholder label="site area" />} />
          <KV k="Built-up (sq ft)" v={plan.builtupAreaSqft?.toLocaleString("en-IN") ?? <Placeholder label="built-up area" />} />
          <KV k="Ward" v={plan.ward ?? <Placeholder label="ward" />} />
          <KV k="Survey status" v={plan.surveyStatus ?? <Placeholder label="survey status" />} />
          <KV k="Head teacher" v={plan.headTeacherName ?? <Placeholder label="head teacher" />} />
          <KV k="Head teacher phone" v={seesSensitive ? (plan.headTeacherPhone ?? <Placeholder label="phone" />) : <span className="text-stone-400">(hidden)</span>} />
          <KV k="SDMC" v={plan.sdmcStatus ?? <Placeholder label="SDMC status" />} />
          <KV k="Department contact" v={seesSensitive ? (plan.deptContactName ?? <Placeholder label="dept contact" />) : <span className="text-stone-400">(hidden)</span>} />
          <KV k="Our lead" v={plan.ourLead?.name ?? plan.ourLead?.email ?? <Placeholder label="our lead" />} />
          <KV k="Anchor partner" v={anchorLabel ?? <Placeholder label="anchor partner" />} />
          <KV k="After-hours campus use" v={plan.campusAfterHoursUse ?? <Placeholder label="after-hours use" />} />
        </div>
        <div className="md:col-span-2 mt-2 text-xs">
          <div className="text-[10px] uppercase tracking-widest text-stone-400 mb-1">Capacity read</div>
          <div className="text-stone-700 leading-relaxed">
            {plan.capacityRead ?? <Placeholder label="a paragraph on how the space maps to the demand" />}
          </div>
        </div>
      </div>

      {/* §2 Catchment */}
      <SectionBar n="2" title="Catchment" ready={completeness.sections[1].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 space-y-3">
        {plan.geoLat != null && plan.geoLng != null ? (
          <CatchmentMap
            schoolLat={plan.geoLat}
            schoolLng={plan.geoLng}
            schoolName={plan.name}
            settlements={plan.settlements
              .filter((s) => s.geoLat != null && s.geoLng != null)
              .map((s) => ({
                id: s.id, name: s.name,
                geoLat: s.geoLat!, geoLng: s.geoLng!,
                distanceMeters: s.distanceMeters,
                walkMinutes: s.walkMinutes,
                children3to14: s.children3to14,
              }))}
            walkRadiusMeters={750}
          />
        ) : mapArtifact ? (
          <img src={mapArtifact.url} alt={mapArtifact.caption ?? "Catchment map"} className="rounded-lg border border-stone-200 max-h-96" />
        ) : (
          <div className="rounded-lg border-2 border-dashed border-stone-200 p-6 text-center text-xs text-stone-400">
            — catchment map (set the school's lat/lng in Edit, or upload a map artefact) —
          </div>
        )}
        {plan.settlements.length === 0 ? (
          <Placeholder label="no settlements listed yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E9EEF6] text-stone-700">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Settlement</th>
                  <th className="text-left px-2 py-1.5 font-medium">Distance / walk</th>
                  <th className="text-right px-2 py-1.5 font-medium">0–3</th>
                  <th className="text-right px-2 py-1.5 font-medium">3–14</th>
                  <th className="text-right px-2 py-1.5 font-medium">14–18</th>
                  <th className="text-left px-2 py-1.5 font-medium">Services</th>
                </tr>
              </thead>
              <tbody>
                {plan.settlements.map((s) => (
                  <tr key={s.id} className="border-t border-stone-100">
                    <td className="px-2 py-1.5">{s.name}</td>
                    <td className="px-2 py-1.5 text-stone-500">
                      {s.distanceMeters ? `${s.distanceMeters} m` : "—"}
                      {s.walkMinutes ? ` · ${s.walkMinutes} min` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-right">{s.children0to3 ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{s.children3to14 ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{s.children14to18 ?? "—"}</td>
                    <td className="px-2 py-1.5 text-stone-500">{s.existingServices ?? "—"}</td>
                  </tr>
                ))}
                <tr className="border-t border-stone-200 font-medium text-stone-700">
                  <td colSpan={2} className="px-2 py-1.5 text-right">Total</td>
                  <td className="px-2 py-1.5 text-right">{sum(plan.settlements, "children0to3")}</td>
                  <td className="px-2 py-1.5 text-right">{sum(plan.settlements, "children3to14")}</td>
                  <td className="px-2 py-1.5 text-right">{sum(plan.settlements, "children14to18")}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-stone-700">
          <span className="text-stone-500">Expected children/day:</span> {plan.targetChildrenPerDay ?? <Placeholder label="target" />}
        </div>
        <div className="text-xs text-stone-700">
          <span className="text-stone-500">Mobilisation notes:</span> {plan.mobilisationNotes ?? <Placeholder label="approach" />}
        </div>
      </div>

      {/* §3 Space */}
      <SectionBar n="3" title="Space" ready={completeness.sections[2].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 space-y-3">
        {plan.isInterimStructure ? (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 space-y-1">
            <div className="font-semibold">Interim structure spec</div>
            <div className="whitespace-pre-wrap text-stone-800">
              {plan.interimStructureSpec ?? <Placeholder label="interim-structure spec pending" />}
            </div>
          </div>
        ) : plan.spaces.length === 0 ? (
          <Placeholder label="no spaces listed" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E9EEF6] text-stone-700">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Building / floor</th>
                  <th className="text-left px-2 py-1.5 font-medium">Space</th>
                  <th className="text-right px-2 py-1.5 font-medium">sqm</th>
                  <th className="text-left px-2 py-1.5 font-medium">Current use</th>
                  <th className="text-left px-2 py-1.5 font-medium">Proposed use</th>
                  <th className="text-right px-2 py-1.5 font-medium">Capacity × sessions</th>
                  <th className="text-left px-2 py-1.5 font-medium">Changes / flags</th>
                </tr>
              </thead>
              <tbody>
                {plan.spaces.map((s) => (
                  <tr key={s.id} className="border-t border-stone-100">
                    <td className="px-2 py-1.5 text-stone-500">{s.building ?? "—"}{s.floor ? ` · ${s.floor}` : ""}</td>
                    <td className="px-2 py-1.5">{s.name}</td>
                    <td className="px-2 py-1.5 text-right">{s.sizeSqm?.toFixed(1) ?? "—"}</td>
                    <td className="px-2 py-1.5 text-stone-500">{s.currentUse ?? "—"}</td>
                    <td className="px-2 py-1.5 text-stone-500">{s.proposedUse ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      {s.capacityPerSession != null ? `${s.capacityPerSession} × ${s.sessionsPerDay ?? 1}` : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-stone-500">
                      {[s.changesNeeded, s.structuralFlags].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs text-stone-700">
          <span className="text-stone-500">Daily capacity:</span> <b>{dailyCapacity}</b> vs demand <b>{plan.targetChildrenPerDay ?? "—"}</b>
          {shortfall > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              ⚠ short by {shortfall}
            </span>
          )}
        </div>
        {surveyDrawing && (
          <p className="text-[10px] text-stone-400">
            Annexure A · <a href={surveyDrawing.url} target="_blank" rel="noopener" className="underline">survey drawings ({surveyDrawing.name})</a>
          </p>
        )}
      </div>

      {/* §4 Services & infrastructure */}
      <SectionBar n="4" title="Services & infrastructure" ready={completeness.sections[3].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        {SERVICE_ITEMS.map((item) => {
          const row = servicesByKey.get(item.key);
          const status = row?.status ?? "unknown";
          const cls = status === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
            : status === "gap" ? "text-rose-700 bg-rose-50 border-rose-200"
            : "text-stone-500 bg-stone-50 border-stone-200";
          return (
            <div key={item.key} className="flex items-start justify-between gap-3 text-xs border-b border-stone-100 py-1.5">
              <span className="text-stone-700">{item.label}</span>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{status.toUpperCase()}</span>
                {row?.details && <span className="text-[10px] text-stone-500 max-w-[220px] text-right">{row.details}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* §5 Programme offer */}
      <SectionBar n="5" title="Programme offer" ready={completeness.sections[4].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 space-y-2">
        {PROGRAMME_COMPONENTS.map((c) => {
          const row = componentsByKey.get(c.key);
          return (
            <div key={c.key} className="border-b border-stone-100 py-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-stone-800">{c.label}</div>
                  <div className="text-stone-600 mt-0.5">{row?.offerText ?? <Placeholder label="offer" />}</div>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  <div className="text-[10px] uppercase tracking-widest text-stone-400">Delivered by</div>
                  <div className="text-stone-700">{row?.deliveredBy ?? c.defaultDelivery}</div>
                </div>
              </div>
              <div className="flex gap-4 mt-1 text-[11px] text-stone-500">
                {row?.schedule && <span>Schedule: {row.schedule}</span>}
                {row?.childrenPerDay != null && <span>Children/day: {row.childrenPerDay}</span>}
                {row?.planVetted !== undefined && (
                  <span className={row.planVetted ? "text-emerald-700" : "text-amber-700"}>
                    {row.planVetted ? "Plan vetted ✓" : "Vetting pending"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* §6 Staffing */}
      <SectionBar n="6" title="Staffing & operating model" ready={completeness.sections[5].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 space-y-2">
        {plan.staffing.length === 0 ? (
          <Placeholder label="no staffing plan" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E9EEF6] text-stone-700">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Role</th>
                  <th className="text-right px-2 py-1.5 font-medium">Count</th>
                  <th className="text-left px-2 py-1.5 font-medium">Payroll</th>
                  <th className="text-left px-2 py-1.5 font-medium">Status</th>
                  <th className="text-left px-2 py-1.5 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {plan.staffing.map((r) => (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="px-2 py-1.5">{r.role}</td>
                    <td className="px-2 py-1.5 text-right">{r.count}</td>
                    <td className="px-2 py-1.5 text-stone-500">{r.payroll}</td>
                    <td className="px-2 py-1.5 text-stone-500">{r.status}</td>
                    <td className="px-2 py-1.5 text-stone-500">
                      {seesSensitive ? (r.notes ?? "—") : <span className="text-stone-400">(hidden)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="text-xs">
          <KV k="Anchor partner" v={anchorLabel ?? <Placeholder label="anchor" />} />
        </div>
      </div>

      {/* §7 Timeline */}
      <SectionBar n="7" title="Timeline" ready={completeness.sections[6].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 space-y-2">
        {plan.milestones.length === 0 ? (
          <Placeholder label="no milestones logged" />
        ) : (
          <ol className="space-y-1.5 text-xs">
            {plan.milestones.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${m.status === "done" ? "bg-emerald-500" : "bg-stone-300"}`} />
                <span className="text-stone-800">{m.name}</span>
                <span className="text-stone-500 ml-auto">{m.targetDate ? m.targetDate.toISOString().slice(0, 10) : "—"}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* §8 Budget */}
      <SectionBar n="8" title="Budget" ready={completeness.sections[7].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 space-y-3">
        {seesSensitive ? (
          <>
            <div className="text-xs flex items-center gap-3">
              <DeviationChip pct={deviationPct} />
              <span className="text-stone-500">
                School Y1 recurring: <b className="text-stone-800">{inr(schoolRecurring)}</b> · Standard {inr(STANDARD_TOTALS_Y1.recurringRupees)} · Threshold {DEVIATION_THRESHOLD_PCT}%
              </span>
            </div>
            {deviationPct != null && Math.abs(deviationPct) > DEVIATION_THRESHOLD_PCT && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
                <b>GC re-approval flag.</b> Recurring cost deviates {deviationPct.toFixed(1)}% from the standard ₹36,000/child/year envelope. Individual grants above this threshold must return to the GC.
              </div>
            )}
            {plan.budget ? (
              <div className="text-xs">
                <Link href={`/schools/${id}/budget`} className="text-sky-600 hover:text-sky-800">Open {plan.budget.name} →</Link>
                <span className="text-stone-500 ml-2">({plan.budget.lines.length} lines)</span>
              </div>
            ) : (
              <Placeholder label="no budget attached — run the seed script" />
            )}
          </>
        ) : (
          <div className="text-xs text-stone-500">
            <span className="text-stone-400">Budget details are restricted for your role.</span>
          </div>
        )}
      </div>

      {/* §9 Risks */}
      <SectionBar n="9" title="Risks & open issues" ready={completeness.sections[8].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 space-y-2">
        {plan.risks.length === 0 ? (
          <Placeholder label="no risks logged" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#E9EEF6] text-stone-700">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Risk</th>
                  <th className="text-left px-2 py-1.5 font-medium">Mitigation</th>
                  <th className="text-left px-2 py-1.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {plan.risks.map((r) => (
                  <tr key={r.id} className="border-t border-stone-100">
                    <td className="px-2 py-1.5">{r.description}</td>
                    <td className="px-2 py-1.5 text-stone-500">{r.mitigation ?? "—"}</td>
                    <td className="px-2 py-1.5 text-stone-500">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* §10 Sign-off */}
      <SectionBar n="10" title="Sign-off" ready={completeness.sections[9].ready} />
      <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-400">Prepared</div>
          <div className="text-stone-800 mt-0.5">{plan.signoff?.preparedAt ? plan.signoff.preparedAt.toISOString().slice(0, 10) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-400">Reviewed (city lead)</div>
          <div className="text-stone-800 mt-0.5">{plan.signoff?.reviewedAt ? plan.signoff.reviewedAt.toISOString().slice(0, 10) : "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-400">Approved</div>
          <div className="text-stone-800 mt-0.5">{plan.signoff?.approvedAt ? plan.signoff.approvedAt.toISOString().slice(0, 10) : "—"}</div>
        </div>
      </div>

      {/* Ready-for-review nudge */}
      {!completeness.ready && (
        <div className="mt-6 rounded-xl bg-stone-100 border border-stone-200 px-4 py-3 text-xs text-stone-600">
          <b>Not yet ready for review.</b> {10 - completeness.readyCount} section{10 - completeness.readyCount === 1 ? "" : "s"} still incomplete:{" "}
          {completeness.sections.filter((s) => !s.ready).map((s) => `§${s.section}`).join(", ")}. Open <Link href={`/schools/${id}/edit`} className="text-sky-600 hover:underline">edit</Link> to fill.
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-stone-400">{label}</div>
      <div className="text-lg font-semibold text-stone-900">{value ?? <span className="text-stone-300">—</span>}</div>
    </div>
  );
}

function sum<T>(rows: T[], key: keyof T): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}
