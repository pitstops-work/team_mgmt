"use client";

import Link from "next/link";
import { MapPin, Users, CalendarDays, Target, ChevronRight, ExternalLink } from "lucide-react";
import Avatar from "@/components/Avatar";

type User = { id: string; name: string | null; image: string | null };
type Partner = { key: string; label: string; color: string };
type City = { id: string; name: string };
type Cluster = { id: string; name: string; zone: { id: string; name: string } };
type Profile = {
  totalHouseholds: number | null;
  children6m3yr: number | null;
  children4to14: number | null;
  youth15to21: number | null;
  elderly60plus: number | null;
  lastSyncedAt: string | null;
};
type Assessment = {
  id: string;
  assessedAt: string;
  assessmentYear: number | null;
  existingCreches: number | null;
  existingChildrenCentres: number | null;
  existingYouthGroups: number | null;
  existingElderlyKitchens: number | null;
  existingCommunityToilets: number | null;
  existingWaterATMs: number | null;
};
type Note = { note: string; updatedAt: string };
type Pitstop = { id: string; title: string; status: string; targetDate: string | null };
type Goal = {
  id: string;
  title: string;
  status: string;
  needsDomain: string | null;
  targetDate: string | null;
  owner: User;
  pitstops: Pitstop[];
};
type DirectPitstop = {
  id: string;
  title: string;
  status: string;
  targetDate: string | null;
  goal: { id: string; title: string };
  owner: User;
};

interface Props {
  settlement: {
    id: string;
    name: string;
    centroidLat: number | null;
    centroidLng: number | null;
    city: City | null;
    partner: Partner | null;
    cluster: Cluster | null;
    profile: Profile | null;
    assessments: Assessment[];
    note: Note | null;
    needsGoals: Goal[];
    needsPitstops: DirectPitstop[];
  };
}

const STATUS_COLORS: Record<string, string> = {
  Active: "#10b981",
  Paused: "#f59e0b",
  Complete: "#94a3b8",
  Upcoming: "#6366f1",
  InProgress: "#f59e0b",
  Done: "#94a3b8",
};

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: STATUS_COLORS[status] ?? "#94a3b8" }}
    />
  );
}

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SettlementDetail({ settlement }: Props) {
  const { name, city, partner, cluster, profile, assessments, note, needsGoals, needsPitstops } = settlement;
  const lat = settlement.centroidLat;
  const lng = settlement.centroidLng;

  const activeGoals = needsGoals.filter((g) => g.status === "Active");
  const otherGoals = needsGoals.filter((g) => g.status !== "Active");

  const latestAssessment = assessments[0] ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-stone-400">
        <Link href="/map" className="hover:text-stone-600">Map</Link>
        <ChevronRight className="w-3 h-3" />
        {city && <><span>{city.name}</span><ChevronRight className="w-3 h-3" /></>}
        {cluster?.zone && (
          <>
            <span>{cluster.zone.name}</span>
            <ChevronRight className="w-3 h-3" />
            <span>{cluster.name}</span>
            <ChevronRight className="w-3 h-3" />
          </>
        )}
        <span className="text-stone-700 font-medium">{name}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">{name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {city && (
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-stone-200 text-stone-600">
                {city.name}
              </span>
            )}
            {partner && (
              <span
                className="text-xs font-bold px-2.5 py-0.5 rounded-full text-white"
                style={{ background: partner.color }}
              >
                {partner.label}
              </span>
            )}
            {cluster?.zone && (
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                {cluster.zone.name} Zone
              </span>
            )}
            {cluster && (
              <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {cluster.name} Cluster
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {lat && lng && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 border border-indigo-200 hover:bg-indigo-50 transition-colors"
            >
              <MapPin className="w-3.5 h-3.5" />
              Directions
            </a>
          )}
          <Link
            href={`/needs/settlement/${settlement.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Assess
          </Link>
        </div>
      </div>

      {/* Population */}
      {profile && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Population</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Households", value: profile.totalHouseholds },
              { label: "Children 0–3 yr", value: profile.children6m3yr },
              { label: "Children 4–14 yr", value: profile.children4to14 },
              { label: "Youth 15–21 yr", value: profile.youth15to21 },
              { label: "Elderly 60+", value: profile.elderly60plus },
            ].map(({ label, value }) => (
              <div key={label} className="bg-stone-50 rounded-xl px-4 py-3 flex items-center gap-3">
                <Users className="w-4 h-4 text-stone-400 flex-shrink-0" />
                <div>
                  <p className="text-xs text-stone-400">{label}</p>
                  <p className="text-lg font-bold text-stone-800">{value ?? "—"}</p>
                </div>
              </div>
            ))}
          </div>
          {profile.lastSyncedAt && (
            <p className="text-[10px] text-stone-400 mt-2">
              Profile last synced {fmt(profile.lastSyncedAt)}
            </p>
          )}
        </section>
      )}

      {/* Active Goals */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400">Active Goals</h2>
          <span className="text-xs text-stone-400">{activeGoals.length} active · {needsGoals.length} total</span>
        </div>
        {activeGoals.length === 0 ? (
          <p className="text-sm text-stone-400 italic">No active goals for this settlement.</p>
        ) : (
          <div className="space-y-2">
            {activeGoals.map((goal) => (
              <div key={goal.id} className="rounded-xl border border-stone-100 overflow-hidden">
                <div className="px-4 py-2.5 bg-stone-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusDot status={goal.status} />
                    <Link
                      href={`/goals/${goal.id}`}
                      className="text-sm font-semibold text-stone-700 hover:text-sky-600 truncate"
                    >
                      {goal.title}
                    </Link>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {goal.needsDomain && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 uppercase">
                        {goal.needsDomain}
                      </span>
                    )}
                    {goal.owner && <Avatar name={goal.owner.name} image={goal.owner.image} size="xs" />}
                  </div>
                </div>
                {goal.pitstops.length > 0 && (
                  <div className="divide-y divide-stone-50">
                    {goal.pitstops.map((p) => (
                      <div key={p.id} className="px-4 py-2 flex items-center gap-2">
                        <StatusDot status={p.status} />
                        <span className="text-xs text-stone-600 flex-1 truncate">{p.title}</span>
                        {p.targetDate && (
                          <span className="text-[10px] text-stone-400 flex-shrink-0">
                            {new Date(p.targetDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Paused / Complete goals collapsed */}
        {otherGoals.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-600 select-none">
              {otherGoals.length} paused / complete goal{otherGoals.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-1.5">
              {otherGoals.map((goal) => (
                <div key={goal.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-stone-50">
                  <StatusDot status={goal.status} />
                  <Link href={`/goals/${goal.id}`} className="text-xs text-stone-600 hover:text-sky-600 truncate flex-1">
                    {goal.title}
                  </Link>
                  <span className="text-[10px] text-stone-400">{goal.status}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* Direct pitstops (not via a goal, assigned directly to this settlement) */}
      {needsPitstops.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">
            Pitstops assigned here
          </h2>
          <div className="space-y-1.5">
            {needsPitstops.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-stone-100 bg-white">
                <StatusDot status={p.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-stone-700 truncate">{p.title}</p>
                  <p className="text-[10px] text-stone-400 truncate">{p.goal.title}</p>
                </div>
                {p.owner && <Avatar name={p.owner.name} image={p.owner.image} size="xs" />}
                {p.targetDate && (
                  <span className="text-[10px] text-stone-400 flex-shrink-0">
                    {new Date(p.targetDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Latest Assessment */}
      {latestAssessment && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Latest Assessment</h2>
          <div className="rounded-xl border border-stone-100 px-4 py-3 bg-stone-50">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-3.5 h-3.5 text-stone-400" />
              <span className="text-xs text-stone-500">
                {fmt(latestAssessment.assessedAt)}
                {latestAssessment.assessmentYear ? ` · Year ${latestAssessment.assessmentYear}` : ""}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { label: "Creches", value: latestAssessment.existingCreches },
                { label: "Children Centres", value: latestAssessment.existingChildrenCentres },
                { label: "Youth Groups", value: latestAssessment.existingYouthGroups },
                { label: "Elderly Kitchens", value: latestAssessment.existingElderlyKitchens },
                { label: "Community Toilets", value: latestAssessment.existingCommunityToilets },
                { label: "Water ATMs", value: latestAssessment.existingWaterATMs },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white rounded-lg px-3 py-2">
                  <p className="text-[10px] text-stone-400">{label}</p>
                  <p className="text-base font-bold text-stone-800">{value ?? 0}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Notes */}
      {note?.note && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-3">Field Notes</h2>
          <div className="rounded-xl border border-stone-100 px-4 py-3 bg-stone-50">
            <p className="text-sm text-stone-700 whitespace-pre-wrap">{note.note}</p>
            {note.updatedAt && (
              <p className="text-[10px] text-stone-400 mt-2">Updated {fmt(note.updatedAt)}</p>
            )}
          </div>
        </section>
      )}

      {/* All assessments history */}
      {assessments.length > 1 && (
        <section>
          <details>
            <summary className="text-xs text-stone-400 cursor-pointer hover:text-stone-600 select-none">
              {assessments.length - 1} older assessment{assessments.length - 1 !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-1.5">
              {assessments.slice(1).map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-50">
                  <Target className="w-3 h-3 text-stone-400" />
                  <span className="text-xs text-stone-600">{fmt(a.assessedAt)}</span>
                  {a.assessmentYear && (
                    <span className="text-[10px] text-stone-400">Year {a.assessmentYear}</span>
                  )}
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
