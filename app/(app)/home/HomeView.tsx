"use client";

import { useState } from "react";
import {
  CalendarClock, CheckCircle2, Target, MapPin, BarChart3,
  LayoutDashboard, Users, TrendingUp, AlertTriangle, Activity, ListTree,
  ClipboardList, Gauge,
} from "lucide-react";
import type {
  DomainStat, ClusterStat, ClusterStatus, RPHealthStat, ZLHealthStat,
  RPPitstopDetail, AdminDash, AdminGoal, AdminUser, AdminZone,
  OverduePitstop, AdminPersonHealth, AdminDelayedPitstop, AdminOverdueActivity,
  AdminEngagementStat, AdminCityCoverage, LeaderTeamMember,
  RPClusterDeckCluster, FacilityLayerConfigLite,
} from "./page";
import type {
  Activity as HomeActivity, ChecklistItem, Goal, TeamMember, ZLTeamActivity, TabKey,
  LeaderActivityCreated,
} from "./_lib/types";

import { TodayTab as LeaderTodayTab } from "./leader/TodayTab";
import { LeaderActivityTab } from "./leader/ActivityTab";
import { RPCoverageTab } from "./rp/CoverageTab";
import { ZLTodayTab } from "./zl/TodayTab";
import { ZLTeamHealthTab } from "./zl/TeamHealthTab";
import { ZLCoverageTab } from "./zl/CoverageTab";
import { ZLClusterStatusTab } from "./zl/ClusterStatusTab";
import { PMTodayTab } from "./pm/TodayTab";
import { PMCoverageTab } from "./pm/CoverageTab";
import { PMZLHealthTab } from "./pm/ZLHealthTab";
import { PMRPHealthTab } from "./pm/RPHealthTab";
import { AdminOverviewTab } from "./admin/OverviewTab";
import { AdminGoalsTab } from "./admin/GoalsTab";
import { AdminGeoTab } from "./admin/GeoTab";
import { AdminTeamTab } from "./admin/TeamTab";
import { AdminAttentionTab } from "./admin/AttentionTab";
import { AdminTeamHealthTab } from "./admin/TeamHealthTab";
import { AdminEngagementTab } from "./admin/EngagementTab";
import { AdminPipelineTab } from "./admin/PipelineTab";
import { AdminCoverageTab } from "./admin/CoverageTab";
import { PastTab } from "./_shared/PastTab";
import { GoalsTab } from "./_shared/GoalsTab";
import { DoneLog } from "./rp/DoneLog";
import { FollowUpsTab } from "./_shared/FollowUpsTab";
import { TeamReportTab } from "./_shared/TeamReportTab";
import { AccountabilityTab } from "./_shared/AccountabilityTab";
import type { ActivityModalPitstopRef, ActivityModalUser } from "./_shared/AddActivityModal";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";

/** Map active home tab → RBAC surface id (lib/rbacSurfaces.ts). */
function tabSurface(tab: TabKey): string {
  return `home.${tab.replace(/-/g, "_")}`;
}

// ── Tab catalogs ──────────────────────────────────────────────────────────────

// RP daily execution now lives in the Operations world (/operations). /home
// keeps the RP's follow-ups + done log; the time-first "Today" tab is retired.
const RP_TABS = [
  { key: "follow-ups", label: "Follow-ups", icon: ListTree },
  { key: "past",       label: "Done log",   icon: CheckCircle2 },
] as const;

const ZL_TABS = [
  { key: "today",          label: "Today",          icon: CalendarClock },
  { key: "follow-ups",     label: "Follow-ups",     icon: ListTree },
  { key: "past",           label: "Past",           icon: CheckCircle2 },
  { key: "team-report",    label: "Team Report",    icon: ClipboardList },
  { key: "accountability", label: "Accountability", icon: Gauge },
  { key: "health",         label: "Team Health",    icon: Activity },
  { key: "coverage",       label: "Field Coverage", icon: BarChart3 },
  { key: "clusters",       label: "Cluster Status", icon: MapPin },
  { key: "goals",          label: "Goals",          icon: Target },
] as const;

const ADMIN_TABS = [
  { key: "today",          label: "Today",         icon: CalendarClock },
  { key: "follow-ups",     label: "Follow-ups",    icon: ListTree },
  { key: "past",           label: "Past",          icon: CheckCircle2 },
  { key: "team-report",    label: "Team Report",   icon: ClipboardList },
  { key: "accountability", label: "Accountability", icon: Gauge },
  { key: "overview",       label: "Overview",      icon: LayoutDashboard },
  { key: "attention",      label: "Attention",     icon: AlertTriangle },
  { key: "team-health",    label: "Team Health",   icon: Activity },
  { key: "engagement",     label: "Engagement",    icon: TrendingUp },
  { key: "goals",          label: "Goals",         icon: Target },
  { key: "coverage",       label: "Field Coverage", icon: BarChart3 },
  { key: "geography",      label: "Geography",     icon: MapPin },
  { key: "team",           label: "Team",          icon: Users },
] as const;

const PM_TABS = [
  { key: "today",          label: "Today",          icon: CalendarClock },
  { key: "follow-ups",     label: "Follow-ups",     icon: ListTree },
  { key: "past",           label: "Past",           icon: CheckCircle2 },
  { key: "team-report",    label: "Team Report",    icon: ClipboardList },
  { key: "accountability", label: "Accountability", icon: Gauge },
  { key: "zl-health",      label: "ZL Health",      icon: Users },
  { key: "rp-health",      label: "RP Health",      icon: Activity },
  { key: "coverage",       label: "Field Coverage", icon: BarChart3 },
  { key: "clusters",       label: "Cluster Status", icon: MapPin },
  { key: "goals",          label: "Goals",          icon: Target },
] as const;

// Leader + Other share OTHER_TABS. Team Report + Accountability are gated to
// non-Other below via the dispatcher (Other has no team in practice but it's
// harmless if so).
const OTHER_TABS = [
  { key: "today",          label: "Today",          icon: CalendarClock },
  { key: "follow-ups",     label: "Follow-ups",     icon: ListTree },
  { key: "past",           label: "Past",           icon: CheckCircle2 },
  { key: "team-report",    label: "Team Report",    icon: ClipboardList },
  { key: "accountability", label: "Accountability", icon: Gauge },
  { key: "activity",       label: "Activity log",   icon: ListTree },
  { key: "goals",          label: "Goals",          icon: Target },
] as const;

// ── Dispatcher ────────────────────────────────────────────────────────────────

export default function HomeView({
  userId, userName, designation, greeting, todayLabel,
  todayActivities, weekActivities, weekChecklists, myGoals,
  rpClusterStats, rpOverdueActivities, rpOverdueTotal, rpDoneActivities, rpClusterDeck, facilityLayerConfigs, pastTeamDoneActivities, zlOverdueActivities, zlMyActivities, zlZoneName, zlClusterStats, clusterStatus, teamMembers, rpTeamHealth,
  pmZLMembers, pmRPMembers, pmZLHealth, pmRPHealth, pmZLOverdueActivities, pmZLChecklists, pmMyActivities, pmRPOverdueActivities, pmRPChecklists, pmZoneClusterMap, pmClusterStats, pmClusterStatus,
  leaderOverdueActivities, leaderMyActivities, leaderTeam,
  leaderActivityCreated,
  adminDash,
  addActivityPitstops, addActivityUsers,
}: {
  userId: string;
  userName: string;
  designation: string;
  greeting: string;
  todayLabel: string;
  todayActivities: HomeActivity[];
  weekActivities: HomeActivity[];
  weekChecklists: ChecklistItem[];
  myGoals: Goal[];
  rpClusterStats: ClusterStat[];
  rpOverdueActivities: HomeActivity[];
  rpOverdueTotal: number;
  rpDoneActivities: HomeActivity[];
  rpClusterDeck: RPClusterDeckCluster[];
  facilityLayerConfigs: FacilityLayerConfigLite[];
  pastTeamDoneActivities: ZLTeamActivity[];
  zlOverdueActivities: ZLTeamActivity[];
  zlMyActivities: ZLTeamActivity[];
  zlZoneName: string | null;
  zlClusterStats: ClusterStat[];
  clusterStatus: ClusterStatus[];
  teamMembers: TeamMember[];
  rpTeamHealth: RPHealthStat[];
  pmZLMembers: { id: string; name: string | null; image: string | null; reportsToId: string | null }[];
  pmRPMembers: { id: string; name: string | null; image: string | null; reportsToId: string | null }[];
  pmZLHealth: ZLHealthStat[];
  pmRPHealth: RPHealthStat[];
  pmZLOverdueActivities: ZLTeamActivity[];
  pmZLChecklists: ChecklistItem[];
  pmMyActivities: ZLTeamActivity[];
  pmRPOverdueActivities: ZLTeamActivity[];
  pmRPChecklists: ChecklistItem[];
  pmZoneClusterMap: { id: string; name: string; clusterIds: string[] }[];
  pmClusterStats: ClusterStat[];
  pmClusterStatus: ClusterStatus[];
  leaderOverdueActivities: HomeActivity[];
  leaderMyActivities: HomeActivity[];
  leaderTeam: LeaderTeamMember[];
  leaderActivityCreated: LeaderActivityCreated[];
  adminDash: AdminDash | null;
  addActivityPitstops: ActivityModalPitstopRef[];
  addActivityUsers: ActivityModalUser[];
}) {
  const isAdmin = !!adminDash;
  const tabs = isAdmin ? ADMIN_TABS
    : designation === "ZL" ? ZL_TABS
    : designation === "RP" ? RP_TABS
    : designation === "PM" ? PM_TABS
    : OTHER_TABS;
  // RP has no "today" tab anymore (moved to /operations) — land on Follow-ups.
  const defaultTab: TabKey = designation === "RP" ? "follow-ups" : "today";
  const [activeTab, setActiveTab] = useState<TabKey>(defaultTab);
  const [goalInitialStatus, setGoalInitialStatus] = useState<string>("All");

  function onTabSwitch(tab: TabKey, goalStatus?: string) {
    if (goalStatus !== undefined) setGoalInitialStatus(goalStatus);
    setActiveTab(tab);
  }

  const firstName = userName.split(" ")[0] || userName;
  const designationBadge = designation !== "Other"
    ? <span className="text-xs text-stone-400 font-normal ml-1">({designation})</span>
    : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-white">

      {/* Header */}
      <div className="px-5 sm:px-8 pt-6 pb-5 border-b border-stone-100">
        <h1 className="text-xl font-semibold text-stone-900">
          {greeting}{firstName ? `, ${firstName}` : ""}
          {designationBadge}
        </h1>
        <p className="text-sm text-stone-400 mt-0.5">{todayLabel}</p>
      </div>

      {/* Tab bar */}
      <div className="border-b border-stone-200 bg-white">
        <div className="px-5 sm:px-8 flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {(tabs as readonly { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                  isActive
                    ? "border-sky-500 text-sky-700"
                    : "border-transparent text-stone-500 hover:text-stone-800"
                }`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — wrapped in SurfaceProvider so mutations from inside any
          tab carry X-Surface: home.<tab>. Restrict per-tab in /settings/roles. */}
      <SurfaceProvider id={tabSurface(activeTab)}>
      <div className={`flex-1 px-5 sm:px-8 py-6 pb-24 sm:pb-8 ${
        activeTab === "today" || activeTab === "overview" || activeTab === "pipeline" || activeTab === "team"
          ? "max-w-6xl"
          : "max-w-3xl"
      }`}>

        {/* Follow-ups — RP scope=mine, supervisors scope=team. Admin and Other follow
            the supervisor pattern: they want to see what's open across people. */}
        {activeTab === "follow-ups" && (
          <FollowUpsTab
            scope={designation === "RP" ? "mine" : "team"}
            currentUserId={userId}
          />
        )}

        {activeTab === "past" && designation === "RP" && (
          <DoneLog userId={userId} doneActivities={rpDoneActivities} />
        )}
        {activeTab === "past" && designation !== "RP" && (
          <PastTab
            userId={userId}
            ownDoneActivities={rpDoneActivities}
            teamDoneActivities={pastTeamDoneActivities}
            designation={designation}
          />
        )}

        {activeTab === "health" && designation === "ZL" && (
          <ZLTeamHealthTab teamMembers={teamMembers} rpTeamHealth={rpTeamHealth} />
        )}
        {activeTab === "today" && designation === "ZL" && (
          <ZLTodayTab
            userId={userId}
            teamMembers={teamMembers}
            weekChecklists={weekChecklists}
            zlOverdueActivities={zlOverdueActivities}
            zlMyActivities={zlMyActivities}
            clusterStatus={clusterStatus}
            rpTeamHealth={rpTeamHealth}
            addActivityPitstops={addActivityPitstops}
            addActivityUsers={addActivityUsers}
          />
        )}

        {activeTab === "today" && designation === "PM" && (
          <PMTodayTab
            userId={userId}
            zlMembers={pmZLMembers}
            rpMembers={pmRPMembers}
            pmZLOverdueActivities={pmZLOverdueActivities}
            pmZLChecklists={pmZLChecklists}
            pmMyActivities={pmMyActivities}
            pmRPOverdueActivities={pmRPOverdueActivities}
            pmRPChecklists={pmRPChecklists}
            addActivityPitstops={addActivityPitstops}
            addActivityUsers={addActivityUsers}
          />
        )}
        {activeTab === "zl-health" && designation === "PM" && (
          <PMZLHealthTab zlMembers={pmZLMembers} rpMembers={pmRPMembers} zlHealth={pmZLHealth} rpHealth={pmRPHealth} />
        )}
        {activeTab === "rp-health" && designation === "PM" && (
          <PMRPHealthTab zlMembers={pmZLMembers} rpMembers={pmRPMembers} rpHealth={pmRPHealth} />
        )}
        {activeTab === "coverage" && designation === "PM" && (
          <PMCoverageTab zoneClusterMap={pmZoneClusterMap} clusterStats={pmClusterStats} />
        )}
        {activeTab === "clusters" && designation === "PM" && (
          <ZLClusterStatusTab clusterStatus={pmClusterStatus} />
        )}

        {activeTab === "today" && designation !== "RP" && designation !== "ZL" && designation !== "PM" && (
          <LeaderTodayTab
            userId={userId}
            overdueActivities={leaderOverdueActivities}
            myActivities={leaderMyActivities}
            weekChecklists={weekChecklists}
            leaderTeam={leaderTeam}
            addActivityPitstops={addActivityPitstops}
            addActivityUsers={addActivityUsers}
          />
        )}

        {/* Team Report — gated to anyone but RP. Backend RBAC is what enforces
            scope; this client gate just hides the tab dispatch on RP catalogs
            (RP_TABS doesn't include it anyway, defence-in-depth). The picker
            list is assembled per-role from whichever team prop is populated. */}
        {activeTab === "team-report" && designation !== "RP" && (
          <TeamReportTab
            currentUserId={userId}
            teamMembers={(() => {
              const self = { id: userId, name: userName, image: null };
              if (isAdmin && adminDash) {
                return [self, ...adminDash.users
                  .filter(u => u.id !== userId)
                  .map(u => ({ id: u.id, name: u.name, image: u.image }))];
              }
              if (designation === "ZL") {
                return [self, ...teamMembers.map(m => ({ id: m.id, name: m.name, image: m.image }))];
              }
              if (designation === "PM") {
                const dedup = new Map<string, { id: string; name: string | null; image: string | null }>();
                for (const m of [...pmZLMembers, ...pmRPMembers]) dedup.set(m.id, { id: m.id, name: m.name, image: m.image });
                return [self, ...[...dedup.values()].filter(m => m.id !== userId)];
              }
              // Leader / Other
              return [self, ...leaderTeam.filter(m => m.id !== userId).map(m => ({ id: m.id, name: m.name, image: m.image }))];
            })()}
          />
        )}

        {activeTab === "activity" && !isAdmin && designation !== "RP" && designation !== "ZL" && designation !== "PM" && (
          <LeaderActivityTab activities={leaderActivityCreated} />
        )}

        {/* Accountability — same audience + team-member roster as Team Report.
            Server enforces team_metrics.read scope; this client gate just hides
            the tab dispatch on RP (RP_TABS doesn't include it). */}
        {activeTab === "accountability" && designation !== "RP" && (
          <AccountabilityTab
            currentUserId={userId}
            teamMembers={(() => {
              const self = { id: userId, name: userName, image: null };
              if (isAdmin && adminDash) {
                return [self, ...adminDash.users
                  .filter(u => u.id !== userId)
                  .map(u => ({ id: u.id, name: u.name, image: u.image }))];
              }
              if (designation === "ZL") {
                return [self, ...teamMembers.map(m => ({ id: m.id, name: m.name, image: m.image }))];
              }
              if (designation === "PM") {
                const dedup = new Map<string, { id: string; name: string | null; image: string | null }>();
                for (const m of [...pmZLMembers, ...pmRPMembers]) dedup.set(m.id, { id: m.id, name: m.name, image: m.image });
                return [self, ...[...dedup.values()].filter(m => m.id !== userId)];
              }
              return [self, ...leaderTeam.filter(m => m.id !== userId).map(m => ({ id: m.id, name: m.name, image: m.image }))];
            })()}
          />
        )}

        {activeTab === "coverage" && designation === "RP" && <RPCoverageTab clusterStats={rpClusterStats} />}
        {activeTab === "coverage" && designation === "ZL" && <ZLCoverageTab zoneName={zlZoneName} clusterStats={zlClusterStats} />}
        {activeTab === "coverage" && isAdmin && adminDash && <AdminCoverageTab dash={adminDash} />}
        {activeTab === "clusters" && designation === "ZL" && <ZLClusterStatusTab clusterStatus={clusterStatus} />}
        {activeTab === "goals" && !isAdmin && (
          <GoalsTab goals={myGoals} userId={userId} designation={designation} teamMembers={teamMembers} />
        )}

        {activeTab === "overview" && adminDash && (
          <AdminOverviewTab dash={adminDash} todayActivities={todayActivities} onTabSwitch={onTabSwitch} />
        )}
        {activeTab === "attention" && adminDash && <AdminAttentionTab dash={adminDash} />}
        {activeTab === "team-health" && adminDash && <AdminTeamHealthTab personHealth={adminDash.personHealth} overdueActivities={adminDash.overdueActivitiesList} />}
        {activeTab === "engagement" && adminDash && <AdminEngagementTab engagement={adminDash.engagement} />}
        {activeTab === "goals" && adminDash && (
          <AdminGoalsTab goals={adminDash.goals} domainConfigs={adminDash.domainConfigs} initialStatusFilter={goalInitialStatus} />
        )}
        {activeTab === "geography" && adminDash && <AdminGeoTab zones={adminDash.zones} />}
        {activeTab === "team" && adminDash && <AdminTeamTab users={adminDash.users} />}
        {activeTab === "pipeline" && adminDash && <AdminPipelineTab dash={adminDash} />}
      </div>
      </SurfaceProvider>
    </div>
  );
}
