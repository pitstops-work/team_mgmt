import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import type { Metadata } from "next";
import { SERVICE_ITEMS, PROGRAMME_COMPONENTS } from "@/lib/schoolPlan/stepTemplate";
import { computeSpaceCapacity } from "@/lib/schoolPlan/rules";

// Read-only public view of a School Plan. Auth-free; opt-in via publicSlug.
// Budget details + salaries + phones are redacted (no seesSensitive flag).

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const plan = await prisma.schoolPlan.findUnique({ where: { publicSlug: slug }, select: { name: true } });
  return { title: plan ? `School Plan · ${plan.name}` : "School Plan" };
}

export default async function PublicSchoolPlanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const plan = await prisma.schoolPlan.findUnique({
    where: { publicSlug: slug },
    include: {
      anchorPartner: { select: { name: true } },
      settlements: { orderBy: { sortOrder: "asc" } },
      spaces: { orderBy: { sortOrder: "asc" } },
      services: true,
      components: { orderBy: { sortOrder: "asc" } },
      milestones: { orderBy: { sortOrder: "asc" } },
      staffing: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!plan) notFound();

  const anchorLabel = plan.anchorPartner?.name ?? plan.anchorPartnerName;
  const svcMap = new Map(plan.services.map((s) => [s.item, s]));
  const compMap = new Map(plan.components.map((c) => [c.component, c]));
  const capacity = computeSpaceCapacity(plan.spaces);
  const total = (plan.enrolmentBoys ?? 0) + (plan.enrolmentGirls ?? 0);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-4xl mx-auto p-6 space-y-2">
        {/* Cover */}
        <div className="rounded-2xl overflow-hidden">
          <div className="bg-[#1F3A5F] text-white px-5 py-6">
            <div className="text-[10px] uppercase tracking-widest text-white/60">
              After-School Centres · Directorate of Minorities · {plan.district ?? "Bangalore"}
            </div>
            <div className="text-2xl font-semibold mt-1">School Plan · {plan.name}</div>
            <div className="text-xs text-white/70 mt-1">{plan.officialName ?? ""}</div>
            <div className="text-[10px] text-white/50 mt-3">
              Public view · Read-only · Version {plan.planVersion} · Status {plan.planStatus}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-stone-100">
            <StatCard label="Enrolment" value={total > 0 ? total.toLocaleString("en-IN") : null} />
            <StatCard label="Site (sq ft)" value={plan.siteAreaSqft?.toLocaleString("en-IN")} />
            <StatCard label="Daily capacity" value={capacity || null} />
            <StatCard label="Children/day planned" value={plan.targetChildrenPerDay} />
          </div>
        </div>

        {plan.isInterimStructure && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
            <b>Interim structure.</b> The Directorate has not yet constructed the school building.
          </div>
        )}

        {/* §1 School */}
        <SB n="1" title="School snapshot" />
        <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <KV k="Type" v={plan.schoolType} />
          <KV k="DISE code" v={plan.diseCode} />
          <KV k="Established" v={plan.yearEstablished} />
          <KV k="Grades / sections" v={`${plan.grades ?? "—"} / ${plan.sections ?? "—"}`} />
          <KV k="Medium(s)" v={plan.mediums.join(", ")} />
          <KV k="Enrolment (b/g)" v={plan.enrolmentBoys != null && plan.enrolmentGirls != null ? `${plan.enrolmentBoys} / ${plan.enrolmentGirls}` : null} />
          <KV k="Timings" v={plan.timings} />
          <KV k="Classrooms" v={plan.classroomsCount} />
          <KV k="Ward" v={plan.ward} />
          <KV k="Anchor partner" v={anchorLabel} />
        </div>

        {/* §2 Catchment (numbers only, no map) */}
        <SB n="2" title="Catchment" />
        <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4">
          {plan.settlements.length === 0 ? (
            <p className="text-xs text-stone-400 italic">— catchment data pending —</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-[#E9EEF6] text-stone-700">
                <tr>
                  <th className="text-left px-2 py-1.5">Settlement</th>
                  <th className="text-left px-2 py-1.5">Distance / walk</th>
                  <th className="text-right px-2 py-1.5">3–14</th>
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
                    <td className="px-2 py-1.5 text-right">{s.children3to14 ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* §3 Space */}
        <SB n="3" title="Space" />
        <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 text-xs">
          {plan.isInterimStructure ? (
            <p className="whitespace-pre-wrap">{plan.interimStructureSpec ?? "— interim-structure spec pending —"}</p>
          ) : plan.spaces.length === 0 ? (
            <p className="text-stone-400 italic">— survey pending —</p>
          ) : (
            <ul className="space-y-1">
              {plan.spaces.map((s) => (
                <li key={s.id} className="border-b border-stone-100 py-1">
                  <b>{s.name}</b> {s.building && <span className="text-stone-500">· {s.building}</span>}
                  {s.sizeSqm && <span className="text-stone-500"> · {s.sizeSqm.toFixed(1)} sqm</span>}
                  {s.proposedUse && <span className="text-stone-500"> → {s.proposedUse}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* §4 Services */}
        <SB n="4" title="Services & infrastructure" />
        <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 text-xs grid grid-cols-1 md:grid-cols-2 gap-1">
          {SERVICE_ITEMS.map((it) => {
            const row = svcMap.get(it.key);
            return <div key={it.key} className="flex items-center justify-between border-b border-stone-100 py-1">
              <span className="text-stone-700">{it.label}</span>
              <span className="text-[10px] text-stone-500 uppercase">{row?.status ?? "unknown"}</span>
            </div>;
          })}
        </div>

        {/* §5 Programme offer */}
        <SB n="5" title="Programme offer" />
        <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 text-xs space-y-2">
          {PROGRAMME_COMPONENTS.map((def) => {
            const row = compMap.get(def.key);
            return (
              <div key={def.key} className="border-b border-stone-100 py-1.5">
                <div className="flex items-center justify-between">
                  <b>{def.label}</b>
                  <span className="text-[10px] text-stone-500">Delivered by {row?.deliveredBy ?? def.defaultDelivery}</span>
                </div>
                {row?.offerText && <div className="text-stone-700 mt-0.5">{row.offerText}</div>}
              </div>
            );
          })}
        </div>

        {/* §7 Timeline */}
        {plan.milestones.length > 0 && (
          <>
            <SB n="7" title="Timeline" />
            <div className="rounded-b-xl border border-t-0 border-stone-200 bg-white p-4 text-xs">
              <ol className="space-y-1">
                {plan.milestones.map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <span>{m.name}</span>
                    <span className="text-stone-500">{m.targetDate ? m.targetDate.toISOString().slice(0, 10) : "—"}</span>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}

        <p className="text-[10px] text-stone-400 pt-6">
          Public read-only view. Budget details, salaries and direct contact numbers are not shown here.
          For the full plan, please contact the programme office.
        </p>
      </div>
    </div>
  );
}

function SB({ n, title }: { n: string; title: string }) {
  return (
    <div className="bg-[#1F3A5F] text-white px-4 py-2 rounded-t-xl mt-6">
      <div className="text-sm font-semibold">§{n} · {title}</div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-stone-500 shrink-0 min-w-[140px]">{k}</span>
      <span className="text-stone-800 truncate">{v ?? "—"}</span>
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
