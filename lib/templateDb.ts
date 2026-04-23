// Types for DB-backed templates (GoalTemplateDef table)

export interface DbChecklistItem {
  text: string;
  activityTitle?: string;
}

export interface DbPitstop {
  title: string;
  type: string;
  notes: string;
  slaDays: number;
  startSlaDays: number;
  recurrence?: string;
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
      ...(item.activityTitle ? { activityTitle: interpolate(item.activityTitle, params) } : {}),
    })),
  }));
}
