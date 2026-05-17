// Types for DB-backed templates (GoalTemplateDef table)

export interface DbActivity {
  title: string;
  completionType: string; // "" | "Activity" | "Voice" | "Upload"
}

export interface DbChecklistItem {
  text: string;
  // Stable identifier for binding to indicators / external systems.
  // Auto-derived by slugifying text on first save; admin may override.
  key?: string;
  activities?: DbActivity[];
  // Legacy single-activity fields (kept for backward compat reading)
  activityTitle?: string;
  completionType?: string;
}

export function slugifyChecklistText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function normalizeActivities(item: DbChecklistItem): DbActivity[] {
  if (item.activities) return item.activities;
  if (item.activityTitle) return [{ title: item.activityTitle, completionType: item.completionType ?? "Activity" }];
  return [];
}

export interface DbPitstop {
  title: string;
  type: string;
  notes: string;
  slaDays: number;
  startSlaDays: number;
  recurrence?: string;
  repeatCount?: number;  // how many instances to generate for recurring pitstops (default: 1)
  progressTag?: string;
  checklist: DbChecklistItem[];
}

export interface DbTemplateParam {
  key: string;
  label: string;
  type: "number" | "text" | "choice";
  min?: number;
  max?: number;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface DbTemplate {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  needsDomain: string | null;
  linkedFacilityLayerKey?: string | null;
  sortOrder: number;
  parameters: DbTemplateParam[];
  pitstops: DbPitstop[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Substitute {paramKey} placeholders in text with values from params
export function interpolate(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key]) : `{${key}}`
  );
}

export function interpolatePitstops(
  pitstops: DbPitstop[],
  params: Record<string, string | number>
): DbPitstop[] {
  return pitstops.map((pt) => ({
    ...pt,
    title: interpolate(pt.title, params),
    notes: interpolate(pt.notes, params),
    checklist: pt.checklist.map((item) => ({
      text: interpolate(item.text, params),
      key: item.key,
      completionType: item.completionType,
      activities: normalizeActivities(item).map((act) => ({
        title: interpolate(act.title, params),
        completionType: act.completionType,
      })),
    })),
  }));
}
