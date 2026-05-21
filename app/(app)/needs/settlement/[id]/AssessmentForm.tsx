"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft, ChevronDown, ChevronRight, Save, PlusCircle, History,
  Users, Home, Droplets, Toilet, Zap, Trash2, Shield, Building2,
  ClipboardList, BadgeCheck, TrendingUp, AlertCircle, CheckCircle2, Map
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Scheme = { id: string; name: string; parentId: string | null; sortOrder: number };
type FormulaConfig = {
  domain: string;
  numerator: number | null;
  denominator: number | null;
  description: string | null;
  label: string | null;
  color: string | null;
  domainType: string | null;
  populationField: string | null;
  linkedSchemeId: string | null;
};
type GoalActual = { id: string; status: string; title: string; needsDomain: string; parameter: number | null; metrics: { current: number }[] };

type Assessment = {
  id: string;
  assessmentYear: number;
  assessedAt: string;
  assessedBy: { name: string | null };
  totalHouseholds: number;
  children6m3yr: number;
  children4to14: number;
  youth15to21: number;
  elderly60plus: number;
  existingCreches: number;
  existingChildrenCentres: number;
  existingYouthGroups: number;
  existingYouthResourceCentres: number;
  existingElderlyKitchens: number;
  existingElderlyCentres: number;
  existingPalliativeUnits: number;
  existingPalliativeCareServices: number;
  existingReferralSystems: number;
  existingCommunityToilets: number;
  existingWaterATMs: number;
  settlementType: string | null;
  composition: string | null;
  predominantGroups: string | null;
  languages: string | null;
  yearsEstablished: number | null;
  landOwnership: string | null;
  legalStatus: string | null;
  hakkupatraEligible: number | null;
  priorityIssues: string | null;
  enumeratorNotes: string | null;
  addressableCreches: number | null;
  addressableToilets: number | null;
  toiletLandAvailable: boolean | null;
  toiletLandType: string | null;
  addressableWaterATMs: number | null;
  waterATMCurrentCount: number | null;
  waterATMFeasible: boolean | null;
  roads: Record<string, string | boolean | null> | null;
  water: Record<string, string | boolean | null> | null;
  sanitation: Record<string, string | number | boolean | null> | null;
  drainageSewer: Record<string, string | boolean | null> | null;
  drainageStorm: Record<string, string | boolean | null> | null;
  waste: Record<string, string | number | null> | null;
  electricity: Record<string, string | number | null> | null;
  facilities: Record<string, string | number | boolean | null> | null;
  safety: Record<string, string | number | null> | null;
  entitlements: { scheme: { id: string; name: string; parentId: string | null }; eligibleHouseholds: number; enrolledHouseholds: number; surveyEnrolled: number | null; notes: string | null }[];
};

type Settlement = {
  id: string;
  name: string;
  cluster: { id: string; name: string; zone: { id: string; name: string; city: { name: string } | null } };
  assessments: Assessment[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Safe coercion helpers for reading mixed-type Record values from server data
const s = (v: unknown): string => (v == null ? "" : String(v));
const b = (v: unknown): boolean => Boolean(v);
const n = (v: unknown): number => (v == null ? 0 : Number(v));

// Denominator is BOTH divisor and minimum viable threshold:
// floor((pop * numerator) / denom) → 0 when pop < denom (not enough people to justify the facility)
function calcTarget(population: number, denominator: number, numerator = 1) {
  if (population < denominator) return 0;
  return Math.floor((population * numerator) / denominator);
}

function domainActual(goals: GoalActual[], domain: string) {
  let done = 0, inProgress = 0;
  for (const g of goals.filter(g => g.needsDomain === domain)) {
    const val = g.parameter ?? g.metrics[0]?.current ?? 0;
    if (g.status === "Complete") done += val;
    else if (g.status === "Active") inProgress += val;
  }
  return { done, inProgress };
}

function NeedsRow({ label, existing, apfTarget, done, inProgress }: { label: string; existing: number; apfTarget: number; done: number; inProgress: number }) {
  const planned = done + inProgress;
  const gap = Math.max(0, apfTarget - done);
  const pct = apfTarget > 0 ? Math.min(100, Math.round((done / apfTarget) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0 text-xs">
      <span className="w-36 text-stone-600 flex-shrink-0">{label}</span>
      <span className="w-16 text-center text-stone-500">{existing}</span>
      <span className="w-16 text-center font-medium text-stone-800">{planned}</span>
      <span className="w-16 text-center text-emerald-600 font-medium">{done}</span>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : pct >= 50 ? "bg-sky-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`w-10 text-right font-medium ${gap > 0 ? "text-red-500" : "text-emerald-600"}`}>
          {gap > 0 ? `-${gap}` : "✓"}
        </span>
      </div>
    </div>
  );
}

// ── Accordion Section ─────────────────────────────────────────────────────────

function Section({ title, icon, children, defaultOpen = false }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-stone-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors text-left">
        <span className="text-stone-500">{icon}</span>
        <span className="text-sm font-semibold text-stone-800 flex-1">{title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>
      {open && <div className="px-4 py-4 space-y-3">{children}</div>}
    </div>
  );
}

// ── Form fields ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-stone-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-400">
      <option value="">– select –</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function NumInput({ value, onChange, placeholder }: { value: number | string; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <input type="number" min={0} value={value} placeholder={placeholder}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-400" />
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full text-sm border border-stone-200 rounded-lg px-3 py-1.5 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-400" />
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button type="button" onClick={() => onChange(!value)}
        className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${value ? "bg-sky-500" : "bg-stone-200"}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <span className="text-sm text-stone-700">{label}</span>
    </label>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AssessmentForm({ settlement, schemes, formulas, goals }: {
  settlement: Settlement;
  schemes: Scheme[];
  formulas: FormulaConfig[];
  goals: GoalActual[];
}) {
  const router = useRouter();
  const latest = settlement.assessments[0] ?? null;
  const [editingId, setEditingId] = useState<string | null>(latest?.id ?? null);
  const [showHistory, setShowHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isMountedRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<(createNew?: boolean) => Promise<void>>(async () => {});

  // ── Load a specific historical assessment into form state ────────────────────
  function loadAssessment(a: Assessment | null) {
    if (!a) return;
    setYear(a.assessmentYear);
    setPop({
      totalHouseholds: a.totalHouseholds,
      children6m3yr: a.children6m3yr,
      children4to14: a.children4to14,
      youth15to21: a.youth15to21,
      elderly60plus: a.elderly60plus,
    });
    setExisting({
      existingCreches: a.existingCreches,
      existingChildrenCentres: a.existingChildrenCentres,
      existingYouthGroups: a.existingYouthGroups,
      existingYouthResourceCentres: a.existingYouthResourceCentres,
      existingElderlyKitchens: a.existingElderlyKitchens,
      existingElderlyCentres: a.existingElderlyCentres,
      existingPalliativeUnits: a.existingPalliativeUnits,
      existingPalliativeCareServices: a.existingPalliativeCareServices,
      existingReferralSystems: a.existingReferralSystems,
      existingCommunityToilets: a.existingCommunityToilets,
      existingWaterATMs: a.existingWaterATMs,
    });
    setAddressableNeed({
      addressableCreches: a.addressableCreches ?? null,
      addressableToilets: a.addressableToilets ?? null,
      toiletLandAvailable: a.toiletLandAvailable ?? null,
      toiletLandType: a.toiletLandType ?? "",
      addressableWaterATMs: a.addressableWaterATMs ?? null,
      waterATMCurrentCount: a.waterATMCurrentCount ?? null,
      waterATMFeasible: a.waterATMFeasible ?? null,
    });
    setProfile({
      settlementType: a.settlementType ?? "",
      composition: a.composition ?? "",
      predominantGroups: a.predominantGroups ?? "",
      languages: a.languages ?? "",
      yearsEstablished: a.yearsEstablished ?? "",
    });
    setTenure({
      landOwnership: a.landOwnership ?? "",
      legalStatus: a.legalStatus ?? "",
      hakkupatraEligible: a.hakkupatraEligible ?? "",
    });
    setRoads({
      roadType: s(a.roads?.roadType), condition: s(a.roads?.condition),
      accessibility: s(a.roads?.accessibility), unusableInRain: b(a.roads?.unusableInRain),
      remarks: s(a.roads?.remarks),
    });
    setWater({
      drinkingSource: s(a.water?.drinkingSource),
      treatsDrinkingWater: b(a.water?.treatsDrinkingWater), treatmentMethod: s(a.water?.treatmentMethod),
      waterQuality: s(a.water?.waterQuality), poorQualityReason: s(a.water?.poorQualityReason),
      nonPotableSource: s(a.water?.nonPotableSource),
      nonPotableSufficient: a.water ? b(a.water.nonPotableSufficient) : true,
      remarks: s(a.water?.remarks),
    });
    setSanitation({
      individualToiletPct: n(a.sanitation?.individualToiletPct),
      sharedToiletPct: n(a.sanitation?.sharedToiletPct),
      openDefecationPct: n(a.sanitation?.openDefecationPct),
      communityToiletCount: n(a.sanitation?.communityToiletCount),
      toiletSeats: n(a.sanitation?.toiletSeats),
      bathCount: n(a.sanitation?.bathCount),
      urinalCount: n(a.sanitation?.urinalCount),
      toiletsPaid: b(a.sanitation?.toiletsPaid),
      toiletFee: s(a.sanitation?.toiletFee),
      toiletCondition: s(a.sanitation?.toiletCondition),
      toiletsSufficient: b(a.sanitation?.toiletsSufficient),
      sewerConnection: s(a.sanitation?.sewerConnection),
      blockageFrequency: s(a.sanitation?.blockageFrequency),
      bathingFacilities: s(a.sanitation?.bathingFacilities),
      remarks: s(a.sanitation?.remarks),
    });
    setDrainSewer({
      disposalType: s(a.drainageSewer?.disposalType), coverage: s(a.drainageSewer?.coverage),
      condition: s(a.drainageSewer?.condition), issues: s(a.drainageSewer?.issues),
      blockageFrequency: s(a.drainageSewer?.blockageFrequency),
      safeDisposal: b(a.drainageSewer?.safeDisposal), remarks: s(a.drainageSewer?.remarks),
    });
    setDrainStorm({
      drainType: s(a.drainageStorm?.drainType), drainCondition: s(a.drainageStorm?.drainCondition),
      connectivity: s(a.drainageStorm?.connectivity), floodingOccurs: b(a.drainageStorm?.floodingOccurs),
      floodFrequency: s(a.drainageStorm?.floodFrequency), floodLevel: s(a.drainageStorm?.floodLevel),
      stagnationDuration: s(a.drainageStorm?.stagnationDuration), remarks: s(a.drainageStorm?.remarks),
    });
    setWaste({
      collectionType: s(a.waste?.collectionType), frequency: s(a.waste?.frequency),
      informalDumpsCount: n(a.waste?.informalDumpsCount), remarks: s(a.waste?.remarks),
    });
    setElectricity({
      hhWithConnection: n(a.electricity?.hhWithConnection),
      hhWithoutConnection: n(a.electricity?.hhWithoutConnection),
      avgHoursPerDay: n(a.electricity?.avgHoursPerDay),
      supplyNature: s(a.electricity?.supplyNature),
      totalStreetlights: n(a.electricity?.totalStreetlights),
      functionalStreetlights: n(a.electricity?.functionalStreetlights),
      streetlightAdequacy: s(a.electricity?.streetlightAdequacy),
      remarks: s(a.electricity?.remarks),
    });
    setFacilities({
      anganwadiCount: n(a.facilities?.anganwadiCount),
      hasSchool: b(a.facilities?.hasSchool), hasPHC: b(a.facilities?.hasPHC),
      hasNammaClinic: b(a.facilities?.hasNammaClinic), hasRationShop: b(a.facilities?.hasRationShop),
      hasCommunityHall: b(a.facilities?.hasCommunityHall), hasLibrary: b(a.facilities?.hasLibrary),
      hasPark: b(a.facilities?.hasPark), hasPlayground: b(a.facilities?.hasPlayground),
      distanceToSchool: n(a.facilities?.distanceToSchool),
      distanceToHealth: n(a.facilities?.distanceToHealth),
      distanceToBusStop: n(a.facilities?.distanceToBusStop),
      remarks: s(a.facilities?.remarks),
    });
    setSafety({ blindSpotsCount: n(a.safety?.blindSpotsCount), remarks: s(a.safety?.remarks) });
    setPriorityIssues(() => {
      if (a.priorityIssues) { try { return JSON.parse(a.priorityIssues as unknown as string); } catch { return []; } }
      return [];
    });
    setEnumeratorNotes(a.enumeratorNotes ?? "");
    const entMap: Record<string, { eligible: number; enrolled: number; surveyEnrolled: number; notes: string }> = {};
    for (const e of a.entitlements ?? []) {
      entMap[e.scheme.id] = { eligible: e.eligibleHouseholds, enrolled: e.enrolledHouseholds, surveyEnrolled: e.surveyEnrolled ?? 0, notes: e.notes ?? "" };
    }
    setEntitlementData(entMap);
  }

  // Build formula lookup
  const formulaMap = Object.fromEntries(formulas.map(f => [f.domain, f.denominator]));

  // ── Form state ──────────────────────────────────────────────────────────────
  const [year, setYear] = useState(latest?.assessmentYear ?? new Date().getFullYear());

  // Population
  const [pop, setPop] = useState({
    totalHouseholds: latest?.totalHouseholds ?? 0,
    children6m3yr: latest?.children6m3yr ?? 0,
    children4to14: latest?.children4to14 ?? 0,
    youth15to21: latest?.youth15to21 ?? 0,
    elderly60plus: latest?.elderly60plus ?? 0,
  });

  // Existing infrastructure
  const [existing, setExisting] = useState({
    existingCreches:               latest?.existingCreches               ?? 0,
    existingChildrenCentres:       latest?.existingChildrenCentres       ?? 0,
    existingYouthGroups:           latest?.existingYouthGroups           ?? 0,
    existingYouthResourceCentres:  latest?.existingYouthResourceCentres  ?? 0,
    existingElderlyKitchens:       latest?.existingElderlyKitchens       ?? 0,
    existingElderlyCentres:        latest?.existingElderlyCentres        ?? 0,
    existingPalliativeUnits:       latest?.existingPalliativeUnits       ?? 0,
    existingPalliativeCareServices:latest?.existingPalliativeCareServices ?? 0,
    existingReferralSystems:       latest?.existingReferralSystems       ?? 0,
    existingCommunityToilets:      latest?.existingCommunityToilets      ?? 0,
    existingWaterATMs:             latest?.existingWaterATMs             ?? 0,
  });

  // Addressable need
  const [addressableNeed, setAddressableNeed] = useState({
    addressableCreches:   latest?.addressableCreches   ?? null as number | null,
    addressableToilets:   latest?.addressableToilets   ?? null as number | null,
    toiletLandAvailable:  latest?.toiletLandAvailable  ?? null as boolean | null,
    toiletLandType:       latest?.toiletLandType        ?? "" as string,
    addressableWaterATMs: latest?.addressableWaterATMs  ?? null as number | null,
    waterATMCurrentCount: latest?.waterATMCurrentCount  ?? null as number | null,
    waterATMFeasible:     latest?.waterATMFeasible      ?? null as boolean | null,
  });

  // Profile
  const [profile, setProfile] = useState({
    settlementType: latest?.settlementType ?? "",
    composition: latest?.composition ?? "",
    predominantGroups: latest?.predominantGroups ?? "",
    languages: latest?.languages ?? "",
    yearsEstablished: latest?.yearsEstablished ?? "",
  });

  // Land & tenure
  const [tenure, setTenure] = useState({
    landOwnership: latest?.landOwnership ?? "",
    legalStatus: latest?.legalStatus ?? "",
    hakkupatraEligible: latest?.hakkupatraEligible ?? "",
  });

  // Roads
  const [roads, setRoads] = useState({
    roadType: s(latest?.roads?.roadType),
    condition: s(latest?.roads?.condition),
    accessibility: s(latest?.roads?.accessibility),
    unusableInRain: b(latest?.roads?.unusableInRain),
    remarks: s(latest?.roads?.remarks),
  });

  // Water
  const [water, setWater] = useState({
    drinkingSource: s(latest?.water?.drinkingSource),
    treatsDrinkingWater: b(latest?.water?.treatsDrinkingWater),
    treatmentMethod: s(latest?.water?.treatmentMethod),
    waterQuality: s(latest?.water?.waterQuality),
    poorQualityReason: s(latest?.water?.poorQualityReason),
    nonPotableSource: s(latest?.water?.nonPotableSource),
    nonPotableSufficient: latest?.water ? b(latest.water.nonPotableSufficient) : true,
    remarks: s(latest?.water?.remarks),
  });

  // Sanitation
  const [sanitation, setSanitation] = useState({
    individualToiletPct: n(latest?.sanitation?.individualToiletPct),
    sharedToiletPct: n(latest?.sanitation?.sharedToiletPct),
    openDefecationPct: n(latest?.sanitation?.openDefecationPct),
    communityToiletCount: n(latest?.sanitation?.communityToiletCount),
    toiletSeats: n(latest?.sanitation?.toiletSeats),
    bathCount: n(latest?.sanitation?.bathCount),
    urinalCount: n(latest?.sanitation?.urinalCount),
    toiletsPaid: b(latest?.sanitation?.toiletsPaid),
    toiletFee: s(latest?.sanitation?.toiletFee),
    toiletCondition: s(latest?.sanitation?.toiletCondition),
    toiletsSufficient: b(latest?.sanitation?.toiletsSufficient),
    sewerConnection: s(latest?.sanitation?.sewerConnection),
    blockageFrequency: s(latest?.sanitation?.blockageFrequency),
    bathingFacilities: s(latest?.sanitation?.bathingFacilities),
    remarks: s(latest?.sanitation?.remarks),
  });

  // Drainage sewer
  const [drainSewer, setDrainSewer] = useState({
    disposalType: s(latest?.drainageSewer?.disposalType),
    coverage: s(latest?.drainageSewer?.coverage),
    condition: s(latest?.drainageSewer?.condition),
    issues: s(latest?.drainageSewer?.issues),
    blockageFrequency: s(latest?.drainageSewer?.blockageFrequency),
    safeDisposal: b(latest?.drainageSewer?.safeDisposal),
    remarks: s(latest?.drainageSewer?.remarks),
  });

  // Drainage storm
  const [drainStorm, setDrainStorm] = useState({
    drainType: s(latest?.drainageStorm?.drainType),
    drainCondition: s(latest?.drainageStorm?.drainCondition),
    connectivity: s(latest?.drainageStorm?.connectivity),
    floodingOccurs: b(latest?.drainageStorm?.floodingOccurs),
    floodFrequency: s(latest?.drainageStorm?.floodFrequency),
    floodLevel: s(latest?.drainageStorm?.floodLevel),
    stagnationDuration: s(latest?.drainageStorm?.stagnationDuration),
    remarks: s(latest?.drainageStorm?.remarks),
  });

  // Waste
  const [waste, setWaste] = useState({
    collectionType: s(latest?.waste?.collectionType),
    frequency: s(latest?.waste?.frequency),
    informalDumpsCount: n(latest?.waste?.informalDumpsCount),
    remarks: s(latest?.waste?.remarks),
  });

  // Electricity
  const [electricity, setElectricity] = useState({
    hhWithConnection: n(latest?.electricity?.hhWithConnection),
    hhWithoutConnection: n(latest?.electricity?.hhWithoutConnection),
    avgHoursPerDay: n(latest?.electricity?.avgHoursPerDay),
    supplyNature: s(latest?.electricity?.supplyNature),
    totalStreetlights: n(latest?.electricity?.totalStreetlights),
    functionalStreetlights: n(latest?.electricity?.functionalStreetlights),
    streetlightAdequacy: s(latest?.electricity?.streetlightAdequacy),
    remarks: s(latest?.electricity?.remarks),
  });

  // Facilities
  const [facilities, setFacilities] = useState({
    anganwadiCount: n(latest?.facilities?.anganwadiCount),
    hasSchool: b(latest?.facilities?.hasSchool),
    hasPHC: b(latest?.facilities?.hasPHC),
    hasNammaClinic: b(latest?.facilities?.hasNammaClinic),
    hasRationShop: b(latest?.facilities?.hasRationShop),
    hasCommunityHall: b(latest?.facilities?.hasCommunityHall),
    hasLibrary: b(latest?.facilities?.hasLibrary),
    hasPark: b(latest?.facilities?.hasPark),
    hasPlayground: b(latest?.facilities?.hasPlayground),
    distanceToSchool: n(latest?.facilities?.distanceToSchool),
    distanceToHealth: n(latest?.facilities?.distanceToHealth),
    distanceToBusStop: n(latest?.facilities?.distanceToBusStop),
    remarks: s(latest?.facilities?.remarks),
  });

  // Safety
  const [safety, setSafety] = useState({
    blindSpotsCount: n(latest?.safety?.blindSpotsCount),
    remarks: s(latest?.safety?.remarks),
  });

  // Priority issues
  const [priorityIssues, setPriorityIssues] = useState<string[]>(() => {
    if (latest?.priorityIssues) {
      try { return JSON.parse(latest.priorityIssues); } catch { return []; }
    }
    return [];
  });
  const [enumeratorNotes, setEnumeratorNotes] = useState(latest?.enumeratorNotes ?? "");

  // Entitlements — enrolled = NGO-assisted, surveyEnrolled = pre-existing at survey time (read-only, from sync)
  const [entitlementData, setEntitlementData] = useState<Record<string, { eligible: number; enrolled: number; surveyEnrolled: number; notes: string }>>(() => {
    const init: Record<string, { eligible: number; enrolled: number; surveyEnrolled: number; notes: string }> = {};
    if (latest?.entitlements) {
      for (const e of latest.entitlements) {
        init[e.scheme.id] = { eligible: e.eligibleHouseholds, enrolled: e.enrolledHouseholds, surveyEnrolled: e.surveyEnrolled ?? 0, notes: e.notes ?? "" };
      }
    }
    return init;
  });

  // ── Calculated targets (dynamic, driven by formula configs) ────────────────
  const POP_MAP: Record<string, number> = {
    children6m3yr:   pop.children6m3yr,
    children4to14:   pop.children4to14,
    youth15to21:     pop.youth15to21,
    elderly60plus:   pop.elderly60plus,
    totalHouseholds: pop.totalHouseholds,
  };

  const EXISTING_MAP: Record<string, number> = {
    Creche:               existing.existingCreches,
    ChildrenCentre:       existing.existingChildrenCentres,
    YouthGroup:           existing.existingYouthGroups,
    YouthResourceCentre:  existing.existingYouthResourceCentres,
    ElderlyKitchen:       existing.existingElderlyKitchens,
    ElderlyCentre:        existing.existingElderlyCentres,
    PalliativeSupport:    existing.existingPalliativeUnits,
    PalliativeCareService:existing.existingPalliativeCareServices,
    ReferralSystem:       existing.existingReferralSystems,
    CommunityToilet:      existing.existingCommunityToilets,
    WaterATM:             existing.existingWaterATMs,
  };

  const targets: Record<string, number> = {};
  const apfTargets: Record<string, number> = {};
  for (const f of formulas) {
    let t = 0;
    if (f.domainType === "boolean") {
      const popVal = f.populationField ? (POP_MAP[f.populationField] ?? 0) : pop.totalHouseholds;
      t = popVal > 0 ? 1 : 0;
    } else if (f.populationField && f.denominator != null) {
      const popVal = POP_MAP[f.populationField] ?? 0;
      t = calcTarget(popVal, f.denominator, f.numerator ?? 1);
    }
    targets[f.domain] = t;
    apfTargets[f.domain] = Math.max(0, t - (EXISTING_MAP[f.domain] ?? 0));
  }

  // ── Scheme hierarchy ────────────────────────────────────────────────────────
  const parentSchemes = schemes.filter(s => !s.parentId);
  const childSchemes = (parentId: string) => schemes.filter(s => s.parentId === parentId);

  function updateEntitlement(schemeId: string, field: "eligible" | "enrolled" | "notes", value: number | string) {
    setEntitlementData(prev => ({
      ...prev,
      [schemeId]: { ...prev[schemeId] ?? { eligible: 0, enrolled: 0, notes: "" }, [field]: value },
    }));
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (createNew = false) => {
    setSaving(true);
    setSaveError(null);
    const payload = {
      settlementId: settlement.id,
      assessmentYear: year,
      // Population
      ...pop,
      // Existing
      ...existing,
      // Profile
      ...profile,
      yearsEstablished: profile.yearsEstablished ? Number(profile.yearsEstablished) : null,
      // Tenure
      ...tenure,
      hakkupatraEligible: tenure.hakkupatraEligible ? Number(tenure.hakkupatraEligible) : null,
      // Sections
      roads, water, sanitation,
      drainageSewer: drainSewer,
      drainageStorm: drainStorm,
      waste, electricity, facilities, safety,
      // Addressable need
      ...addressableNeed,
      // Priority
      priorityIssues: JSON.stringify(priorityIssues),
      enumeratorNotes,
      // Entitlements
      entitlements: Object.entries(entitlementData).map(([schemeId, d]) => ({
        schemeId,
        eligibleHouseholds: d.eligible,
        enrolledHouseholds: d.enrolled,
        notes: d.notes || null,
      })),
    };

    try {
      let res: Response;
      if (createNew || !editingId) {
        res = await fetch("/api/needs/assessments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } else {
        res = await fetch(`/api/needs/assessments/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      if (res.ok) {
        const data = await res.json();
        setEditingId(data.id);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        router.refresh();
      } else {
        const err = await res.json().catch(() => ({}));
        setSaveError(err?.error ?? "Failed to save. Please try again.");
      }
    } catch {
      setSaveError("Network error. Please check your connection.");
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId, year, pop, existing, profile, tenure, roads, water, sanitation, drainSewer, drainStorm, waste, electricity, facilities, safety, priorityIssues, enumeratorNotes, entitlementData]);

  // Keep ref current so auto-save timer always calls the latest closure
  useEffect(() => { handleSaveRef.current = handleSave; });

  // ── Auto-save: debounce 2s after any form field change ──────────────────────
  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return; }
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => { handleSaveRef.current(false); }, 2000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pop, existing, profile, tenure, roads, water, sanitation, drainSewer, drainStorm, waste, electricity, facilities, safety, priorityIssues, enumeratorNotes, entitlementData, year]);

  const priorityOptions = ["Water supply", "Sanitation", "Drainage", "Waste management", "Roads", "Electricity", "Housing security"];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-1.5 text-xs text-stone-400 flex-wrap">
          <Link href="/needs" className="hover:text-sky-600 flex items-center gap-1"><ChevronLeft className="w-3 h-3" />Needs</Link>
          <span>/</span>
          <span>{settlement.cluster.zone.city?.name}</span>
          <span>/</span>
          <span>{settlement.cluster.zone.name}</span>
          <span>/</span>
          <span>{settlement.cluster.name}</span>
          <span>/</span>
          <span className="text-stone-600 font-medium">{settlement.name}</span>
        </div>
        <Link href={`/map?settlement=${encodeURIComponent(settlement.name)}`} className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
          <Map className="w-3 h-3" />
          View on Map
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">{settlement.name}</h1>
          <p className="text-sm text-stone-500 mt-0.5">{settlement.cluster.name} · {settlement.cluster.zone.name}</p>
          {latest && (
            <p className="text-xs text-stone-400 mt-1">
              Last assessed {new Date(latest.assessedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} by {latest.assessedBy.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {saveError && <span className="text-xs text-red-500 max-w-[160px] text-right">{saveError}</span>}
          {settlement.assessments.length > 1 && (
            <button onClick={() => setShowHistory(h => !h)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-stone-200 rounded-lg text-stone-600 hover:bg-stone-50">
              <History className="w-3.5 h-3.5" /> History ({settlement.assessments.length})
            </button>
          )}
          <button onClick={() => handleSave(false)} disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-sky-500 text-white rounded-lg hover:bg-sky-600 disabled:opacity-50">
            {saving ? "Saving..." : saved ? <><CheckCircle2 className="w-3.5 h-3.5" /> Saved</> : <><Save className="w-3.5 h-3.5" /> Save</>}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-sky-300 text-sky-600 rounded-lg hover:bg-sky-50">
            <PlusCircle className="w-3.5 h-3.5" /> New Survey
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="mb-4 border border-stone-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-xs font-semibold text-stone-600">Assessment History</div>
          <div className="divide-y divide-stone-100">
            {settlement.assessments.map(a => (
              <button key={a.id} onClick={() => { setEditingId(a.id); loadAssessment(a); setShowHistory(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 text-left ${editingId === a.id ? "bg-sky-50" : ""}`}>
                <span className="text-xs font-medium text-stone-700">{a.assessmentYear}</span>
                <span className="text-xs text-stone-400">{new Date(a.assessedAt).toLocaleDateString("en-IN")}</span>
                <span className="text-xs text-stone-400">by {a.assessedBy.name}</span>
                <span className="ml-auto text-xs text-stone-500">{a.totalHouseholds} HH</span>
                {editingId === a.id
                  ? <span className="text-[10px] bg-sky-100 text-sky-600 px-1.5 py-0.5 rounded">Editing</span>
                  : <span className="text-[10px] text-stone-400 hover:text-sky-600">Load →</span>
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Year picker */}
      <div className="flex items-center gap-3 mb-5 p-3 bg-stone-50 rounded-xl border border-stone-200">
        <span className="text-xs text-stone-500 font-medium">Assessment Year</span>
        <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
          className="w-24 text-sm border border-stone-200 rounded-lg px-3 py-1 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-400" />
        <span className="text-xs text-stone-400">· {editingId ? "Updating existing survey" : "Will create new survey"}</span>
      </div>

      {/* ── Needs Summary Card ── */}
      <div className="mb-4 border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-stone-50 border-b border-stone-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-sky-500" />
          <span className="text-sm font-semibold text-stone-800">Needs Summary</span>
          <span className="ml-auto text-xs text-stone-400">Existing · Plan/Elig. · Done/Enrolled · Gap</span>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center gap-3 pb-2 border-b border-stone-100 text-[10px] font-medium text-stone-400 uppercase tracking-wide">
            <span className="w-36">Domain</span>
            <span className="w-16 text-center">Existing</span>
            <span className="w-16 text-center">Plan</span>
            <span className="w-16 text-center">Done</span>
            <span className="flex-1 text-right">Gap</span>
          </div>
          {formulas.map(f => {
            if (f.domainType === "entitlement" && f.linkedSchemeId) {
              const ent = entitlementData[f.linkedSchemeId] ?? { eligible: 0, enrolled: 0, surveyEnrolled: 0, notes: "" };
              const totalEnrolled = ent.enrolled + ent.surveyEnrolled;
              const gap = Math.max(0, ent.eligible - totalEnrolled);
              const pct = ent.eligible > 0 ? Math.min(100, Math.round((totalEnrolled / ent.eligible) * 100)) : 0;
              return (
                <div key={f.domain} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0 text-xs">
                  <span className="w-36 text-stone-600 flex-shrink-0">{f.label ?? f.domain}</span>
                  <span className="w-16 text-center text-stone-400">{ent.surveyEnrolled} <span className="text-[9px]">surv.</span></span>
                  <span className="w-16 text-center text-stone-500">{ent.eligible} <span className="text-[9px]">elig.</span></span>
                  <span className="w-16 text-center text-emerald-600 font-medium">{totalEnrolled}</span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-sky-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className={`w-10 text-right font-medium ${gap > 0 ? "text-red-500" : "text-emerald-600"}`}>
                      {gap > 0 ? `-${gap}` : "✓"}
                    </span>
                  </div>
                </div>
              );
            }
            const actuals = domainActual(goals, f.domain);
            return (
              <NeedsRow key={f.domain}
                label={f.label ?? f.domain}
                existing={EXISTING_MAP[f.domain] ?? 0}
                apfTarget={apfTargets[f.domain] ?? 0}
                done={actuals.done}
                inProgress={actuals.inProgress}
              />
            );
          })}
        </div>
      </div>

      {/* ── Form Sections ── */}
      <div className="space-y-3">

        {/* Section 2 — Population */}
        <Section title="Population Data" icon={<Users className="w-4 h-4" />} defaultOpen>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total Households"><NumInput value={pop.totalHouseholds} onChange={v => setPop(p => ({ ...p, totalHouseholds: v }))} /></Field>
            <Field label="Children 6m–3yr (creche)"><NumInput value={pop.children6m3yr} onChange={v => setPop(p => ({ ...p, children6m3yr: v }))} /></Field>
            <Field label="Children 4–14 (children centre)"><NumInput value={pop.children4to14} onChange={v => setPop(p => ({ ...p, children4to14: v }))} /></Field>
            <Field label="Youth 15–21"><NumInput value={pop.youth15to21} onChange={v => setPop(p => ({ ...p, youth15to21: v }))} /></Field>
            <Field label="Elderly 60+"><NumInput value={pop.elderly60plus} onChange={v => setPop(p => ({ ...p, elderly60plus: v }))} /></Field>
          </div>
          <div className="mt-3 p-3 bg-sky-50 rounded-lg text-xs text-sky-700 space-y-1">
            <p className="font-medium text-sky-800">Calculated total targets</p>
            <div className="grid grid-cols-3 gap-1">
              {formulas.map(f => (
                <span key={f.domain}>{f.label ?? f.domain}: <strong>{targets[f.domain] ?? 0}</strong></span>
              ))}
            </div>
          </div>
        </Section>

        {/* Existing Infrastructure */}
        <Section title="Existing Infrastructure" icon={<Building2 className="w-4 h-4" />}>
          <p className="text-xs text-stone-400 mb-2">Infrastructure already present — subtracted from total to get the programme target</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Existing Creches"><NumInput value={existing.existingCreches} onChange={v => setExisting(e => ({ ...e, existingCreches: v }))} /></Field>
            <Field label="Existing Children Centres"><NumInput value={existing.existingChildrenCentres} onChange={v => setExisting(e => ({ ...e, existingChildrenCentres: v }))} /></Field>
            <Field label="Existing Youth Groups"><NumInput value={existing.existingYouthGroups} onChange={v => setExisting(e => ({ ...e, existingYouthGroups: v }))} /></Field>
            <Field label="Existing Youth Resource Centres"><NumInput value={existing.existingYouthResourceCentres} onChange={v => setExisting(e => ({ ...e, existingYouthResourceCentres: v }))} /></Field>
            <Field label="Existing Elderly Kitchens"><NumInput value={existing.existingElderlyKitchens} onChange={v => setExisting(e => ({ ...e, existingElderlyKitchens: v }))} /></Field>
            <Field label="Existing Elderly Centres"><NumInput value={existing.existingElderlyCentres} onChange={v => setExisting(e => ({ ...e, existingElderlyCentres: v }))} /></Field>
            <Field label="Existing Palliative Units"><NumInput value={existing.existingPalliativeUnits} onChange={v => setExisting(e => ({ ...e, existingPalliativeUnits: v }))} /></Field>
            <Field label="Palliative Care Service">
              <Toggle
                label={existing.existingPalliativeCareServices > 0 ? "Has palliative care service" : "No palliative care service"}
                value={existing.existingPalliativeCareServices > 0}
                onChange={v => setExisting(e => ({ ...e, existingPalliativeCareServices: v ? 1 : 0 }))}
              />
            </Field>
            <Field label="Referral System (elderly)">
              <Toggle
                label={existing.existingReferralSystems > 0 ? "Has referral system" : "No referral system"}
                value={existing.existingReferralSystems > 0}
                onChange={v => setExisting(e => ({ ...e, existingReferralSystems: v ? 1 : 0 }))}
              />
            </Field>
            <Field label="Existing Community Toilets"><NumInput value={existing.existingCommunityToilets} onChange={v => setExisting(e => ({ ...e, existingCommunityToilets: v }))} /></Field>
            <Field label="Existing Water ATMs"><NumInput value={existing.existingWaterATMs} onChange={v => setExisting(e => ({ ...e, existingWaterATMs: v }))} /></Field>
          </div>
        </Section>

        {/* Addressable Need */}
        <Section title="Addressable Need" icon={<TrendingUp className="w-4 h-4" />}>
          <p className="text-xs text-slate-400 mb-3">Field-verified, feasibility-filtered demand. Only fill where a specific need has been confirmed on the ground.</p>
          <div className="grid grid-cols-2 gap-4">
            {/* Creches */}
            <div className="col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Creches</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Creches addressable this year">
                  <NumInput
                    value={addressableNeed.addressableCreches ?? 0}
                    onChange={v => setAddressableNeed(n => ({ ...n, addressableCreches: v || null }))}
                  />
                </Field>
              </div>
            </div>
            {/* Community Toilets */}
            <div className="col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Community Toilets</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Toilets addressable">
                  <NumInput
                    value={addressableNeed.addressableToilets ?? 0}
                    onChange={v => setAddressableNeed(n => ({ ...n, addressableToilets: v || null }))}
                  />
                </Field>
                <Field label="Land available?">
                  <select
                    className="input"
                    value={addressableNeed.toiletLandAvailable == null ? "" : addressableNeed.toiletLandAvailable ? "yes" : "no"}
                    onChange={e => setAddressableNeed(n => ({ ...n, toiletLandAvailable: e.target.value === "" ? null : e.target.value === "yes" }))}
                  >
                    <option value="">—</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
                <Field label="Land type">
                  <select
                    className="input"
                    value={addressableNeed.toiletLandType}
                    onChange={e => setAddressableNeed(n => ({ ...n, toiletLandType: e.target.value }))}
                  >
                    <option value="">—</option>
                    <option value="Govt">Govt</option>
                    <option value="Private">Private</option>
                  </select>
                </Field>
              </div>
            </div>
            {/* Water ATMs */}
            <div className="col-span-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Water ATMs</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Currently servicing (count)">
                  <NumInput
                    value={addressableNeed.waterATMCurrentCount ?? 0}
                    onChange={v => setAddressableNeed(n => ({ ...n, waterATMCurrentCount: v || null }))}
                  />
                </Field>
                <Field label="Additional ATMs addressable">
                  <NumInput
                    value={addressableNeed.addressableWaterATMs ?? 0}
                    onChange={v => setAddressableNeed(n => ({ ...n, addressableWaterATMs: v || null }))}
                  />
                </Field>
                <Field label="Feasible? (land/borewell)">
                  <select
                    className="input"
                    value={addressableNeed.waterATMFeasible == null ? "" : addressableNeed.waterATMFeasible ? "yes" : "no"}
                    onChange={e => setAddressableNeed(n => ({ ...n, waterATMFeasible: e.target.value === "" ? null : e.target.value === "yes" }))}
                  >
                    <option value="">—</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </Field>
              </div>
            </div>
          </div>
        </Section>

        {/* Section 2 — Settlement Profile */}
        <Section title="Settlement Profile" icon={<Home className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Settlement Type">
              <Select value={profile.settlementType} onChange={v => setProfile(p => ({ ...p, settlementType: v }))} options={[
                { value: "notified", label: "Slum (notified)" },
                { value: "non-notified", label: "Slum (non-notified)" },
                { value: "informal", label: "Informal settlement" },
                { value: "resettlement", label: "Resettlement colony" },
              ]} />
            </Field>
            <Field label="Composition">
              <Select value={profile.composition} onChange={v => setProfile(p => ({ ...p, composition: v }))} options={[
                { value: "migrant", label: "Mostly migrant" },
                { value: "native", label: "Mostly native" },
                { value: "mixed", label: "Mixed" },
              ]} />
            </Field>
            <Field label="Predominant Groups"><TextInput value={profile.predominantGroups} onChange={v => setProfile(p => ({ ...p, predominantGroups: v }))} placeholder="SC, ST, OBC, Mixed..." /></Field>
            <Field label="Languages Spoken"><TextInput value={profile.languages} onChange={v => setProfile(p => ({ ...p, languages: v }))} placeholder="Kannada, Tamil, Telugu..." /></Field>
            <Field label="Years Since Established"><NumInput value={profile.yearsEstablished} onChange={v => setProfile(p => ({ ...p, yearsEstablished: v }))} /></Field>
          </div>
        </Section>

        {/* Section 3 — Land & Tenure */}
        <Section title="Land & Tenure" icon={<ClipboardList className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Land Ownership">
              <Select value={tenure.landOwnership} onChange={v => setTenure(t => ({ ...t, landOwnership: v }))} options={[
                { value: "BBMP", label: "BBMP" }, { value: "KSDB", label: "KSDB" },
                { value: "BDA", label: "BDA" }, { value: "private", label: "Private" }, { value: "other", label: "Other" },
              ]} />
            </Field>
            <Field label="Legal Status">
              <Select value={tenure.legalStatus} onChange={v => setTenure(t => ({ ...t, legalStatus: v }))} options={[
                { value: "declared", label: "Declared" }, { value: "partially-declared", label: "Partially Declared" },
                { value: "undeclared", label: "Undeclared" }, { value: "eviction-risk", label: "Under Eviction Risk" },
              ]} />
            </Field>
            <Field label="No. Eligible for Hakkupatra"><NumInput value={tenure.hakkupatraEligible} onChange={v => setTenure(t => ({ ...t, hakkupatraEligible: v }))} /></Field>
          </div>
        </Section>

        {/* Section 4 — Roads */}
        <Section title="Roads & Accessibility" icon={<MapPinIcon />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Road Type">
              <Select value={roads.roadType} onChange={v => setRoads(r => ({ ...r, roadType: v }))} options={[
                { value: "CONCRETE", label: "Concrete" }, { value: "GRAVEL", label: "Gravel" },
                { value: "MUD", label: "Mud" }, { value: "NONE", label: "No proper road" },
              ]} />
            </Field>
            <Field label="Condition">
              <Select value={roads.condition} onChange={v => setRoads(r => ({ ...r, condition: v }))} options={[
                { value: "GOOD", label: "Good" }, { value: "DAMAGED", label: "Damaged" }, { value: "VERY_POOR", label: "Very poor" },
              ]} />
            </Field>
            <Field label="Accessibility">
              <Select value={roads.accessibility} onChange={v => setRoads(r => ({ ...r, accessibility: v }))} options={[
                { value: "MOTORABLE", label: "Motorable" }, { value: "TWO_WHEELER", label: "2-wheelers only" }, { value: "PEDESTRIAN", label: "Pedestrian only" },
              ]} />
            </Field>
          </div>
          <Toggle label="Becomes unusable during rain" value={roads.unusableInRain as boolean} onChange={v => setRoads(r => ({ ...r, unusableInRain: v }))} />
          <Field label="Remarks"><TextInput value={roads.remarks as string} onChange={v => setRoads(r => ({ ...r, remarks: v }))} /></Field>
        </Section>

        {/* Section 5 — Water */}
        <Section title="Water Access" icon={<Droplets className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Primary Drinking Water Source">
              <Select value={water.drinkingSource} onChange={v => setWater(w => ({ ...w, drinkingSource: v }))} options={[
                { value: "PIPED", label: "Piped supply" }, { value: "PUBLIC_TAP", label: "Public tap" },
                { value: "BOREWELL", label: "Borewell" }, { value: "TANKER", label: "Tanker" },
                { value: "PACKAGED", label: "Packaged water" }, { value: "OTHER", label: "Other" },
              ]} />
            </Field>
            <Field label="Water Quality">
              <Select value={water.waterQuality} onChange={v => setWater(w => ({ ...w, waterQuality: v }))} options={[
                { value: "GOOD", label: "Good" }, { value: "ACCEPTABLE", label: "Acceptable" }, { value: "POOR", label: "Poor" },
              ]} />
            </Field>
            <Field label="Non-potable Water Source">
              <Select value={water.nonPotableSource} onChange={v => setWater(w => ({ ...w, nonPotableSource: v }))} options={[
                { value: "PIPED", label: "Piped" }, { value: "BOREWELL", label: "Borewell" },
                { value: "TANKER", label: "Tanker" }, { value: "SURFACE", label: "Surface water" }, { value: "MIXED", label: "Mixed" },
              ]} />
            </Field>
          </div>
          <div className="flex gap-4">
            <Toggle label="Treats drinking water" value={water.treatsDrinkingWater as boolean} onChange={v => setWater(w => ({ ...w, treatsDrinkingWater: v }))} />
            <Toggle label="Non-potable supply sufficient" value={water.nonPotableSufficient as boolean} onChange={v => setWater(w => ({ ...w, nonPotableSufficient: v }))} />
          </div>
          <Field label="Remarks"><TextInput value={water.remarks as string} onChange={v => setWater(w => ({ ...w, remarks: v }))} /></Field>
        </Section>

        {/* Section 6 — Sanitation */}
        <Section title="Sanitation" icon={<Toilet className="w-4 h-4" />}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Individual Toilet (% HH)"><NumInput value={sanitation.individualToiletPct} onChange={v => setSanitation(s => ({ ...s, individualToiletPct: v }))} /></Field>
            <Field label="Shared Toilet (% HH)"><NumInput value={sanitation.sharedToiletPct} onChange={v => setSanitation(s => ({ ...s, sharedToiletPct: v }))} /></Field>
            <Field label="Open Defecation (% HH)"><NumInput value={sanitation.openDefecationPct} onChange={v => setSanitation(s => ({ ...s, openDefecationPct: v }))} /></Field>
          </div>
          <p className="text-xs font-medium text-stone-500 mt-1">Community Toilets</p>
          <div className="grid grid-cols-4 gap-3">
            <Field label="No. of blocks"><NumInput value={sanitation.communityToiletCount} onChange={v => setSanitation(s => ({ ...s, communityToiletCount: v }))} /></Field>
            <Field label="Seats"><NumInput value={sanitation.toiletSeats} onChange={v => setSanitation(s => ({ ...s, toiletSeats: v }))} /></Field>
            <Field label="Baths"><NumInput value={sanitation.bathCount} onChange={v => setSanitation(s => ({ ...s, bathCount: v }))} /></Field>
            <Field label="Urinals"><NumInput value={sanitation.urinalCount} onChange={v => setSanitation(s => ({ ...s, urinalCount: v }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Condition">
              <Select value={sanitation.toiletCondition} onChange={v => setSanitation(s => ({ ...s, toiletCondition: v }))} options={[
                { value: "GOOD", label: "Good" }, { value: "FAIR", label: "Fair" }, { value: "POOR", label: "Poor" }, { value: "NOT_USABLE", label: "Not usable" },
              ]} />
            </Field>
            <Field label="Sewer Connection">
              <Select value={sanitation.sewerConnection} onChange={v => setSanitation(s => ({ ...s, sewerConnection: v }))} options={[
                { value: "SEWER_LINE", label: "Sewer line" }, { value: "SEPTIC_TANK", label: "Septic tank" },
                { value: "OPEN_DRAIN", label: "Open drain" }, { value: "NONE", label: "None" },
              ]} />
            </Field>
            <Field label="Bathing Facilities">
              <Select value={sanitation.bathingFacilities} onChange={v => setSanitation(s => ({ ...s, bathingFacilities: v }))} options={[
                { value: "ADEQUATE", label: "Adequate" }, { value: "LIMITED", label: "Limited" }, { value: "NONE", label: "None" },
              ]} />
            </Field>
            <Field label="Blockage Frequency">
              <Select value={sanitation.blockageFrequency} onChange={v => setSanitation(s => ({ ...s, blockageFrequency: v }))} options={[
                { value: "FREQUENTLY", label: "Frequently" }, { value: "OCCASIONALLY", label: "Occasionally" }, { value: "NO_ISSUES", label: "No issues" },
              ]} />
            </Field>
          </div>
          <div className="flex gap-4">
            <Toggle label="Toilets are paid" value={sanitation.toiletsPaid as boolean} onChange={v => setSanitation(s => ({ ...s, toiletsPaid: v }))} />
            <Toggle label="Community toilets sufficient" value={sanitation.toiletsSufficient as boolean} onChange={v => setSanitation(s => ({ ...s, toiletsSufficient: v }))} />
          </div>
        </Section>

        {/* Section 7 — Drainage */}
        <Section title="Drainage & Flooding" icon={<Droplets className="w-4 h-4" />}>
          <p className="text-xs font-semibold text-stone-500">7A — Sewer / Wastewater</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Disposal Type">
              <Select value={drainSewer.disposalType} onChange={v => setDrainSewer(d => ({ ...d, disposalType: v }))} options={[
                { value: "UNDERGROUND", label: "Underground sewer" }, { value: "SEPTIC_INDIVIDUAL", label: "Septic (individual)" },
                { value: "SEPTIC_SHARED", label: "Septic (shared)" }, { value: "OPEN_DRAINS", label: "Open drains" }, { value: "NONE", label: "None" },
              ]} />
            </Field>
            <Field label="Coverage">
              <Select value={drainSewer.coverage} onChange={v => setDrainSewer(d => ({ ...d, coverage: v }))} options={[
                { value: "MOST", label: "Most HH connected" }, { value: "SOME", label: "Some connected" },
                { value: "VERY_FEW", label: "Very few" }, { value: "NONE", label: "None" },
              ]} />
            </Field>
            <Field label="Condition">
              <Select value={drainSewer.condition} onChange={v => setDrainSewer(d => ({ ...d, condition: v }))} options={[
                { value: "GOOD", label: "Good" }, { value: "NEEDS_REPAIR", label: "Needs repair" }, { value: "POOR", label: "Poor / failing" },
              ]} />
            </Field>
          </div>
          <Toggle label="Safe disposal of wastewater" value={drainSewer.safeDisposal as boolean} onChange={v => setDrainSewer(d => ({ ...d, safeDisposal: v }))} />

          <p className="text-xs font-semibold text-stone-500 mt-3">7B — Storm Water</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Drain Type">
              <Select value={drainStorm.drainType} onChange={v => setDrainStorm(d => ({ ...d, drainType: v }))} options={[
                { value: "COVERED", label: "Covered" }, { value: "OPEN", label: "Open" }, { value: "MIXED", label: "Mixed" }, { value: "NONE", label: "None" },
              ]} />
            </Field>
            <Field label="Drain Condition">
              <Select value={drainStorm.drainCondition} onChange={v => setDrainStorm(d => ({ ...d, drainCondition: v }))} options={[
                { value: "CLEAN", label: "Clean" }, { value: "PARTIALLY_CLOGGED", label: "Partially clogged" },
                { value: "FULLY_CLOGGED", label: "Fully clogged" }, { value: "DAMAGED", label: "Damaged" },
              ]} />
            </Field>
          </div>
          <Toggle label="Flooding occurs during monsoon" value={drainStorm.floodingOccurs as boolean} onChange={v => setDrainStorm(d => ({ ...d, floodingOccurs: v }))} />
          {drainStorm.floodingOccurs && (
            <div className="grid grid-cols-3 gap-3 mt-2">
              <Field label="Frequency">
                <Select value={drainStorm.floodFrequency} onChange={v => setDrainStorm(d => ({ ...d, floodFrequency: v }))} options={[
                  { value: "EVERY_RAIN", label: "Every rain" }, { value: "HEAVY_ONLY", label: "Heavy rain only" }, { value: "OCCASIONALLY", label: "Occasionally" },
                ]} />
              </Field>
              <Field label="Flood Level">
                <Select value={drainStorm.floodLevel} onChange={v => setDrainStorm(d => ({ ...d, floodLevel: v }))} options={[
                  { value: "ANKLE", label: "Ankle" }, { value: "KNEE", label: "Knee" }, { value: "ABOVE_KNEE", label: "Above knee" },
                ]} />
              </Field>
              <Field label="Water Stagnation">
                <Select value={drainStorm.stagnationDuration} onChange={v => setDrainStorm(d => ({ ...d, stagnationDuration: v }))} options={[
                  { value: "UNDER_1H", label: "< 1 hour" }, { value: "1_6H", label: "1–6 hours" },
                  { value: "OVER_6H", label: "> 6 hours" }, { value: "OVER_1D", label: "> 1 day" },
                ]} />
              </Field>
            </div>
          )}
        </Section>

        {/* Section 8 — Waste */}
        <Section title="Solid Waste Management" icon={<Trash2 className="w-4 h-4" />}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Collection Type">
              <Select value={waste.collectionType} onChange={v => setWaste(w => ({ ...w, collectionType: v }))} options={[
                { value: "DOOR_TO_DOOR", label: "Door-to-door" }, { value: "COMMUNITY_BINS", label: "Community bins" }, { value: "NONE", label: "None" },
              ]} />
            </Field>
            <Field label="Frequency">
              <Select value={waste.frequency} onChange={v => setWaste(w => ({ ...w, frequency: v }))} options={[
                { value: "DAILY", label: "Daily" }, { value: "ALTERNATE", label: "Alternate days" }, { value: "WEEKLY", label: "Weekly" }, { value: "IRREGULAR", label: "Irregular" },
              ]} />
            </Field>
            <Field label="Informal Dumping Spots (count)"><NumInput value={waste.informalDumpsCount} onChange={v => setWaste(w => ({ ...w, informalDumpsCount: v }))} /></Field>
          </div>
        </Section>

        {/* Section 9 — Electricity */}
        <Section title="Electricity & Street Lighting" icon={<Zap className="w-4 h-4" />}>
          <div className="grid grid-cols-3 gap-3">
            <Field label="HH with connection"><NumInput value={electricity.hhWithConnection} onChange={v => setElectricity(e => ({ ...e, hhWithConnection: v }))} /></Field>
            <Field label="HH without connection"><NumInput value={electricity.hhWithoutConnection} onChange={v => setElectricity(e => ({ ...e, hhWithoutConnection: v }))} /></Field>
            <Field label="Avg hours/day"><NumInput value={electricity.avgHoursPerDay} onChange={v => setElectricity(e => ({ ...e, avgHoursPerDay: v }))} /></Field>
          </div>
          <Field label="Supply Nature">
            <Select value={electricity.supplyNature} onChange={v => setElectricity(e => ({ ...e, supplyNature: v }))} options={[
              { value: "REGULAR", label: "Regular" }, { value: "FREQUENT_CUTS", label: "Frequent power cuts" }, { value: "VERY_UNRELIABLE", label: "Very unreliable" },
            ]} />
          </Field>
          <p className="text-xs font-semibold text-stone-500 mt-2">Street Lighting</p>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Total streetlights"><NumInput value={electricity.totalStreetlights} onChange={v => setElectricity(e => ({ ...e, totalStreetlights: v }))} /></Field>
            <Field label="Functional"><NumInput value={electricity.functionalStreetlights} onChange={v => setElectricity(e => ({ ...e, functionalStreetlights: v }))} /></Field>
            <Field label="Adequacy">
              <Select value={electricity.streetlightAdequacy} onChange={v => setElectricity(e => ({ ...e, streetlightAdequacy: v }))} options={[
                { value: "ADEQUATE", label: "Adequate" }, { value: "FEW", label: "Few" }, { value: "NONE", label: "None" },
              ]} />
            </Field>
          </div>
          {electricity.totalStreetlights > 0 && (
            <div className="mt-1 text-xs text-stone-500">
              {Math.round((Number(electricity.functionalStreetlights) / Number(electricity.totalStreetlights)) * 100)}% functional
            </div>
          )}
        </Section>

        {/* Section 10 — Facilities */}
        <Section title="Community Facilities" icon={<Building2 className="w-4 h-4" />}>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Field label="Anganwadi count"><NumInput value={facilities.anganwadiCount} onChange={v => setFacilities(f => ({ ...f, anganwadiCount: v }))} /></Field>
            <Field label="Distance to school (km)"><NumInput value={facilities.distanceToSchool} onChange={v => setFacilities(f => ({ ...f, distanceToSchool: v }))} /></Field>
            <Field label="Distance to health facility (km)"><NumInput value={facilities.distanceToHealth} onChange={v => setFacilities(f => ({ ...f, distanceToHealth: v }))} /></Field>
            <Field label="Distance to bus stop (km)"><NumInput value={facilities.distanceToBusStop} onChange={v => setFacilities(f => ({ ...f, distanceToBusStop: v }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: "hasSchool", label: "School" }, { key: "hasPHC", label: "PHC" },
              { key: "hasNammaClinic", label: "Namma Clinic" }, { key: "hasRationShop", label: "Ration Shop" },
              { key: "hasCommunityHall", label: "Community Hall" }, { key: "hasLibrary", label: "Public Library" },
              { key: "hasPark", label: "Park" }, { key: "hasPlayground", label: "Playground" },
            ].map(({ key, label }) => (
              <Toggle key={key} label={label} value={facilities[key as keyof typeof facilities] as boolean} onChange={v => setFacilities(f => ({ ...f, [key]: v }))} />
            ))}
          </div>
        </Section>

        {/* Section 11 — Safety */}
        <Section title="Safety & Security" icon={<Shield className="w-4 h-4" />}>
          <Field label="Number of blind spots / unsafe areas"><NumInput value={safety.blindSpotsCount} onChange={v => setSafety(s => ({ ...s, blindSpotsCount: v }))} /></Field>
          <Field label="Remarks"><TextInput value={safety.remarks as string} onChange={v => setSafety(s => ({ ...s, remarks: v }))} /></Field>
        </Section>

        {/* Priority Issues */}
        <Section title="Priority Issues" icon={<AlertCircle className="w-4 h-4" />}>
          <p className="text-xs text-stone-400 mb-2">Select top issues (up to 3)</p>
          <div className="flex flex-wrap gap-2">
            {priorityOptions.map(opt => (
              <button key={opt} type="button"
                onClick={() => setPriorityIssues(prev => prev.includes(opt) ? prev.filter(p => p !== opt) : prev.length < 3 ? [...prev, opt] : prev)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${priorityIssues.includes(opt) ? "bg-sky-500 text-white border-sky-500" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
                {opt}
              </button>
            ))}
          </div>
          <Field label="Enumerator Observations">
            <textarea value={enumeratorNotes} onChange={e => setEnumeratorNotes(e.target.value)} rows={3}
              className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none" />
          </Field>
        </Section>

        {/* Section 12 — Entitlements */}
        <Section title="Entitlements" icon={<BadgeCheck className="w-4 h-4" />}>
          <p className="text-xs text-stone-400 mb-3">Enter eligible and enrolled households per scheme. Saturation = survey baseline + NGO-assisted.</p>
          <div className="space-y-4">
            {parentSchemes.map(parent => {
              const children = childSchemes(parent.id);
              const parentData = entitlementData[parent.id] ?? { eligible: 0, enrolled: 0, surveyEnrolled: 0, notes: "" };
              const totalEnrolled = parentData.enrolled + parentData.surveyEnrolled;
              const sat = parentData.eligible > 0 ? Math.round((totalEnrolled / parentData.eligible) * 100) : null;
              return (
                <div key={parent.id} className="border border-stone-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-3 px-3 py-2 bg-stone-50 border-b border-stone-100">
                    <span className="text-xs font-semibold text-stone-700 flex-1">{parent.name}</span>
                    {sat !== null && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${sat >= 80 ? "bg-emerald-100 text-emerald-700" : sat >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                        {sat}%
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-2 grid grid-cols-3 gap-2">
                    <Field label="Eligible HH">
                      <NumInput value={parentData.eligible} onChange={v => updateEntitlement(parent.id, "eligible", v)} />
                    </Field>
                    <Field label="NGO-assisted HH">
                      <NumInput value={parentData.enrolled} onChange={v => updateEntitlement(parent.id, "enrolled", v)} />
                    </Field>
                    <Field label="Survey baseline">
                      <div className="h-8 flex items-center px-2 bg-stone-50 border border-stone-200 rounded text-sm text-stone-500">
                        {parentData.surveyEnrolled}
                      </div>
                    </Field>
                  </div>
                  {children.length > 0 && (
                    <div className="border-t border-stone-100 divide-y divide-stone-100">
                      {children.map(child => {
                        const d = entitlementData[child.id] ?? { eligible: 0, enrolled: 0, surveyEnrolled: 0, notes: "" };
                        const cTotal = d.enrolled + d.surveyEnrolled;
                        const cSat = d.eligible > 0 ? Math.round((cTotal / d.eligible) * 100) : null;
                        return (
                          <div key={child.id} className="px-3 py-2">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-xs text-stone-500 flex-1">{child.name}</span>
                              {cSat !== null && (
                                <span className={`text-xs font-medium ${cSat >= 80 ? "text-emerald-600" : cSat >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                  {cSat}%
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <NumInput value={d.eligible} onChange={v => updateEntitlement(child.id, "eligible", v)} placeholder="Eligible" />
                              <div>
                                <NumInput value={d.enrolled} onChange={v => updateEntitlement(child.id, "enrolled", v)} placeholder="NGO-assisted" />
                                {d.surveyEnrolled > 0 && (
                                  <p className="text-[10px] text-stone-400 mt-1">Survey: {d.surveyEnrolled} · Total: {cTotal}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

      </div>

      {/* Bottom save bar */}
      <div className="sticky bottom-4 mt-6 flex items-center justify-end gap-2 flex-wrap">
        {saveError && <span className="text-xs text-red-500 flex-1 text-right pr-2">{saveError}</span>}
        {saving && <span className="text-xs text-stone-400">Auto-saving…</span>}
        {saved && !saving && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>}
        <button onClick={() => handleSave(false)} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 text-white text-sm font-medium rounded-xl shadow-lg hover:bg-sky-600 disabled:opacity-50 transition-colors">
          <Save className="w-4 h-4" /> Save now
        </button>
        <button onClick={() => handleSave(true)} disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-sky-300 text-sky-600 text-sm font-medium rounded-xl shadow-lg hover:bg-sky-50 disabled:opacity-50 transition-colors">
          <PlusCircle className="w-4 h-4" /> New Survey
        </button>
      </div>
    </div>
  );
}

// Inline icon to avoid import issues
function MapPinIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
