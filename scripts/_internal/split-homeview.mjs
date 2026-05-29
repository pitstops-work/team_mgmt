#!/usr/bin/env node
/**
 * Splits app/(app)/home/HomeView.tsx into role/shared modules.
 * Line ranges are derived from the pre-split file (HEAD before the refactor).
 * Re-runnable: it reads from git HEAD so re-runs always start from the same source.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO  = path.resolve(__dirname, "../..");
const HOME  = path.join(REPO, "app", "(app)", "home");

const src = execSync(`git -C ${JSON.stringify(REPO)} show HEAD:'app/(app)/home/HomeView.tsx'`, { encoding: "utf8" });
const lines = src.split("\n");
function slice(start, end) { return lines.slice(start - 1, end).join("\n"); }

const LIB_HELPERS = ["fmtTime","fmtDate","fmtDateShort","isToday","daysDiff","daysAgo","activityMeta","groupByDay","fmtDomain","groupBySla","slaHeaderLabel","engLevel","istTodayStr","shiftIstDate"];
const LIB_CONSTS  = ["STATUS_BADGE","STATUS_DOT","CHECKLIST_STATUS_DOT","EVENT_TYPE_COLOR","ACTIVITY_TYPE_STYLE","DESIGNATION_ORDER","DESIGNATION_COLOR","PITSTOP_STATUS_COLOR"];
const LIB_TYPES   = ["ActivityGoal","Activity","ChecklistItem","Goal","TeamMember","ZLTeamActivity","TabKey"];
const PAGE_TYPES  = ["DomainStat","ClusterStat","ClusterStatus","RPHealthStat","ZLHealthStat","RPPitstopDetail","AdminDash","AdminGoal","AdminUser","AdminZone","OverduePitstop","AdminPersonHealth","AdminDelayedPitstop","AdminOverdueActivity","AdminEngagementStat","AdminCityCoverage","LeaderTeamMember","RPClusterDeckCluster","FacilityLayerConfigLite"];
// All lucide icons referenced anywhere in the pre-split file, less Activity
// (collides with the Activity type — chunks never use it as JSX).
const LUCIDE_ICONS = ["CalendarClock","CheckSquare","Target","MapPin","BarChart3","ChevronRight","ChevronLeft","LayoutDashboard","Users","TrendingUp","AlertTriangle","CheckCircle2","Clock","Filter","ChevronDown","ChevronUp","Mic","Square","Loader2","Paperclip"];
const RECHARTS    = ["BarChart","Bar","XAxis","YAxis","Tooltip","ResponsiveContainer","Cell","PieChart","Pie","Legend"];

const SHARED_COMPONENTS = {
  EmptyState: "Primitives", SectionTitle: "Primitives", KpiTile: "Primitives",
  ProgressBar: "Primitives", HealthBar: "Primitives", WeekCard: "Primitives",
  ActivityRow: "ActivityRow", ChecklistRow: "ChecklistRow", GoalRow: "GoalRow",
  DomainTable: "DomainTable", DoneActivityRow: "DoneActivityRow",
  NonZLGoalsView: "NonZLGoalsView", PitstopDetailCard: "PitstopDetailCard",
  ActivityFeedPanel: "ActivityFeedPanel", RPChecklistRow: "RPChecklistRow",
  RPActivityRow: "RPActivityRow", RPOverdueCard: "RPActivityRow",
  RPOverdueCarousel: "RPActivityRow", RPTodayCarousel: "RPActivityRow",
  ZLOverdueCard: "ZLOverdue", ZLOverdueCarousel: "ZLOverdue",
  ZLTodayCarousel: "ZLOverdue", RPHealthCards: "RPHealthCards",
  ClusterTodayView: "ClusterTodayView", RPClusterDeck: "RPClusterDeck",
  RPClusterCard: "RPClusterDeck", DeckSection: "RPClusterDeck",
  PastTab: "PastTab", GoalsTab: "GoalsTab",
};

// Local helper types/consts to reintroduce per file (they sat between component
// bodies in the original).
const EXTRA_BLOCKS = {
  "_shared/ActivityFeedPanel.tsx": `
type ActivityFeedItem = {
  at: string;
  kind: string;
  summary: string;
  entityType: string;
  entityId: string;
  link?: string;
  detail?: { field?: string | null; oldValue?: string | null; newValue?: string | null };
};

const ACTIVITY_KIND_DOT: Record<string, string> = {
  goal_created: "bg-emerald-500", goal_updated: "bg-stone-400", goal_deleted: "bg-red-500",
  pitstop_created: "bg-emerald-500", pitstop_updated: "bg-stone-400", pitstop_deleted: "bg-red-500",
  pitstop_date_change: "bg-amber-500",
  activity_created: "bg-sky-500", activity_completed: "bg-emerald-500",
  activity_cancelled: "bg-red-400", activity_rescheduled: "bg-amber-500",
  activity_responded: "bg-sky-400", activity_updated: "bg-stone-400",
  checklist_created: "bg-sky-500", checklist_checked: "bg-emerald-500",
  checklist_status_change: "bg-amber-500", checklist_updated: "bg-stone-400",
  standup: "bg-violet-500", system: "bg-stone-300",
};
`,
  "_shared/RPClusterDeck.tsx": `
type RPDeckBucket = {
  clusterId: string;
  clusterName: string;
  overdue: Activity[];
  today: Activity[];
  checklists: ChecklistItem[];
  week: Activity[];
};
`,
  "pm/TodayTab.tsx": `
type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
type PMDrillDown =
  | { type: "zl-overdue"; zlId: string }
  | { type: "zl-checklists"; zlId: string }
  | { type: "rp-overdue"; rpId: string }
  | { type: "rp-checklists"; rpId: string }
  | null;
`,
  "_shared/RPHealthCards.tsx": `
type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
`,
  "pm/RPHealthTab.tsx": `
type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
`,
  "pm/ZLHealthTab.tsx": `
type PMTeamMember = { id: string; name: string | null; image: string | null; reportsToId: string | null };
`,
  "admin/EngagementTab.tsx": `
const DESIGNATION_COLOR_ENG: Record<string, string> = {
  RP: "bg-violet-100 text-violet-700",
  ZL: "bg-sky-100 text-sky-700",
  PM: "bg-amber-100 text-amber-700",
};
`,
};

const CHUNKS = [
  // ── _lib ──
  {
    name: "_lib/types.ts",
    ranges: [[21, 86]],
    isClient: false,
    plainImports: "",
    transform: (text) => text.replace(/^type (\w+)/gm, "export type $1"),
    extra: `\nexport type TabKey =
  | "today" | "past" | "health" | "zl-health" | "rp-health" | "coverage"
  | "clusters" | "goals" | "overview" | "geography" | "team" | "pipeline"
  | "attention" | "team-health" | "engagement";\n`,
  },
  {
    name: "_lib/helpers.ts",
    ranges: [[90,121],[147,156],[1995,2019],[2596,2626],[4172,4177]],
    isClient: false,
    plainImports: `import type { Activity, ZLTeamActivity } from "./types";\nimport type { AdminEngagementStat } from "../page";\n`,
    transform: (text) => text.replace(/^function (\w+)/gm, "export function $1"),
  },
  {
    name: "_lib/constants.ts",
    ranges: [[158,187],[4165,4170]],
    isClient: false,
    plainImports: "",
    // Match `const FOO: Type` and `const FOO = […]`
    transform: (text) => text.replace(/^const ([A-Z_]+)(\s*[:=])/gm, "export const $1$2"),
  },

  // ── _shared ──
  { name: "_shared/Primitives.tsx",        ranges: [[122,145],[191,236],[3487,3498]] },
  { name: "_shared/ActivityRow.tsx",       ranges: [[238,260]] },
  { name: "_shared/ChecklistRow.tsx",      ranges: [[262,279]] },
  { name: "_shared/GoalRow.tsx",           ranges: [[281,315]] },
  { name: "_shared/DomainTable.tsx",       ranges: [[317,367]],   shared: ["EmptyState"] },
  { name: "_shared/DoneActivityRow.tsx",   ranges: [[5282,5319]] },
  { name: "_shared/NonZLGoalsView.tsx",    ranges: [[618,737]],   shared: ["EmptyState","GoalRow"] },
  { name: "_shared/PitstopDetailCard.tsx", ranges: [[1663,1690]] },
  { name: "_shared/ActivityFeedPanel.tsx", ranges: [[2281,2330]] },
  { name: "_shared/RPChecklistRow.tsx",    ranges: [[2453,2595]] },
  { name: "_shared/RPActivityRow.tsx",     ranges: [[4178,4552]], shared: ["SectionTitle"] },
  { name: "_shared/ZLOverdue.tsx",         ranges: [[3663,3810]], shared: ["SectionTitle"] },
  { name: "_shared/RPHealthCards.tsx",     ranges: [[3379,3486]], shared: ["HealthBar","PitstopDetailCard"] },
  { name: "_shared/ClusterTodayView.tsx",  ranges: [[4553,4975]], shared: ["RPActivityRow","RPChecklistRow","RPOverdueCarousel","RPTodayCarousel","WeekCard","EmptyState","SectionTitle"], usesDynamicMap: true },
  { name: "_shared/RPClusterDeck.tsx",     ranges: [[5373,5872]], shared: ["RPActivityRow","RPChecklistRow","WeekCard","EmptyState","SectionTitle"], usesDynamicMap: true },
  { name: "_shared/PastTab.tsx",           ranges: [[4976,5281]], shared: ["DoneActivityRow","EmptyState","SectionTitle"] },
  { name: "_shared/GoalsTab.tsx",          ranges: [[549,612]],   shared: ["EmptyState","SectionTitle","GoalRow","NonZLGoalsView"] },

  // ── leader ──
  { name: "leader/TodayTab.tsx",  ranges: [[371,408]], shared: ["ClusterTodayView"], teamPerf: true },

  // ── rp ──
  { name: "rp/TodayTab.tsx",    ranges: [[5320,5372]], shared: ["RPClusterDeck","ClusterTodayView"] },
  { name: "rp/CoverageTab.tsx", ranges: [[413,443]],   shared: ["SectionTitle","DomainTable"] },

  // ── zl ──
  { name: "zl/CoverageTab.tsx",       ranges: [[447,507]],   shared: ["SectionTitle","DomainTable"] },
  { name: "zl/ClusterStatusTab.tsx",  ranges: [[511,545]],   shared: ["EmptyState"] },
  { name: "zl/TeamHealthTab.tsx",     ranges: [[3499,3662]], shared: ["EmptyState","SectionTitle","RPHealthCards","HealthBar"] },
  { name: "zl/TodayTab.tsx",          ranges: [[3811,4164]], shared: ["EmptyState","SectionTitle","WeekCard","ZLOverdueCarousel","ZLTodayCarousel","ClusterTodayView","RPChecklistRow"] },

  // ── pm ──
  { name: "pm/TodayTab.tsx",     ranges: [[2627,3105]], shared: ["EmptyState","SectionTitle","WeekCard","ZLOverdueCarousel","ZLTodayCarousel","ClusterTodayView","RPChecklistRow"] },
  { name: "pm/CoverageTab.tsx",  ranges: [[3106,3153]], shared: ["EmptyState","SectionTitle","DomainTable","ProgressBar"] },
  { name: "pm/ZLHealthTab.tsx",  ranges: [[3154,3321]], shared: ["EmptyState","SectionTitle","RPHealthCards","HealthBar"] },
  { name: "pm/RPHealthTab.tsx",  ranges: [[3322,3378]], shared: ["EmptyState","SectionTitle","RPHealthCards","HealthBar"] },

  // ── admin ──
  { name: "admin/OverviewTab.tsx",    ranges: [[746,1018]],   shared: ["EmptyState","SectionTitle","KpiTile","DomainTable"] },
  { name: "admin/GoalsTab.tsx",       ranges: [[1022,1216]],  shared: ["EmptyState"] },
  { name: "admin/GeoTab.tsx",         ranges: [[1220,1375]],  shared: ["EmptyState","SectionTitle","ProgressBar"] },
  { name: "admin/TeamTab.tsx",        ranges: [[1379,1533]],  shared: ["ProgressBar","EmptyState"] },
  { name: "admin/AttentionTab.tsx",   ranges: [[1534,1662]],  shared: ["EmptyState","SectionTitle"] },
  { name: "admin/TeamHealthTab.tsx",  ranges: [[1691,1994]],  shared: ["EmptyState","SectionTitle","HealthBar","PitstopDetailCard"] },
  { name: "admin/EngagementTab.tsx",  ranges: [[2020,2280]],  shared: ["EmptyState","SectionTitle","ActivityFeedPanel"] },
  { name: "admin/PipelineTab.tsx",    ranges: [[2331,2452]],  shared: ["EmptyState","SectionTitle"] },
  { name: "admin/CoverageTab.tsx",    ranges: [[5873,5999]],  shared: ["EmptyState","SectionTitle","DomainTable"] },
];

function exportTopLevelFunctions(text) { return text.replace(/^function (\w+)/gm, "export function $1"); }

function buildHeader(chunk, depth) {
  if (chunk.plainImports !== undefined) return chunk.plainImports;
  const up = "../".repeat(depth);
  const out = [];
  out.push(`import { useState, useMemo, useRef, useEffect } from "react";`);
  out.push(`import Link from "next/link";`);
  out.push(`import { ${LUCIDE_ICONS.join(", ")} } from "lucide-react";`);
  out.push(`import { ${RECHARTS.join(", ")} } from "recharts";`);
  out.push(`import Avatar from "@/components/Avatar";`);
  if (chunk.usesDynamicMap) {
    out.push(`import dynamic from "next/dynamic";`);
    out.push(`const ClusterMiniMap = dynamic(() => import("@/components/home/ClusterMiniMap"), { ssr: false });`);
  }
  out.push(`import type { ${LIB_TYPES.join(", ")} } from "${up}_lib/types";`);
  out.push(`import { ${LIB_HELPERS.join(", ")} } from "${up}_lib/helpers";`);
  out.push(`import { ${LIB_CONSTS.join(", ")} } from "${up}_lib/constants";`);
  out.push(`import type { ${PAGE_TYPES.join(", ")} } from "${up}page";`);
  if (chunk.shared && chunk.shared.length) {
    const byFile = {};
    for (const s of chunk.shared) {
      const file = SHARED_COMPONENTS[s];
      if (!file) throw new Error(`Unknown shared component: ${s} in ${chunk.name}`);
      (byFile[file] ??= []).push(s);
    }
    for (const file of Object.keys(byFile).sort()) {
      out.push(`import { ${byFile[file].join(", ")} } from "${up}_shared/${file}";`);
    }
  }
  if (chunk.teamPerf) out.push(`import { TeamSlaPanel, TeamOverduePanel } from "${up}TeamPerformance";`);
  return out.join("\n");
}

function fileDirDepth(name) { return name.split("/").length - 1; }

let created = 0;
for (const chunk of CHUNKS) {
  const body = chunk.ranges.map(([s, e]) => slice(s, e)).join("\n\n");
  const isLib = chunk.name.startsWith("_lib/");
  const xform = chunk.transform ?? (isLib ? null : exportTopLevelFunctions);
  const transformed = xform ? xform(body) : body;
  const header = chunk.isClient === false ? "" : `"use client";\n\n`;
  const imports = buildHeader(chunk, fileDirDepth(chunk.name));
  const extra = chunk.extra ?? EXTRA_BLOCKS[chunk.name] ?? "";
  const content = `${header}${imports}\n${extra}\n${transformed}\n`;
  const outPath = path.join(HOME, chunk.name);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content);
  created++;
  console.log(`✓ ${chunk.name}  (${transformed.split("\n").length} lines)`);
}
console.log(`\nCreated ${created} files.`);
