

export type TabKey =
  | "today" | "past" | "health" | "zl-health" | "rp-health" | "coverage"
  | "clusters" | "goals" | "overview" | "geography" | "team" | "pipeline"
  | "attention" | "team-health" | "engagement";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActivityGoal = {
  id: string; title: string; needsDomain: string | null;
  linkedFacilityId?: string | null;
  needsCluster:    { id: string; name: string } | null;
  needsSettlement: { id: string; name: string } | null;
  needsZone:       { id: string; name: string } | null;
};
export type Activity = {
  id: string; title: string; type: string; scheduledAt: string;
  location: string | null; status: string;
  attendees?: { user: { id: string; name: string | null } }[];
  pitstops?: { pitstop: { id: string; title: string; ownerId: string; goal: ActivityGoal } }[];
  /* Reschedule provenance — propagated when the page-level loader selects
     them. UI uses `rescheduleCount` to badge chronic slippage. */
  rescheduleCount?: number;
  rescheduleReasonCode?: string | null;
  /* Add-to-today override. When set to today's start, this activity also
     surfaces on today's list regardless of where scheduledAt actually lives. */
  displayDate?: string | null;
  /* Lifetime count of add_to_today AuditLog actions for this event. Drives
     the "Pulled N×" chip — surfaces patterns of repeated pull-ins even when
     the activity isn't currently pulled. Populated by the home loader. */
  addedToTodayCount?: number;
  /* Optional Done-log enrichment — present on `rpDoneActivities` from the
     page loader so the Done-log feed can render proof + completion time. */
  completedAt?: string | null;
  completedBy?: { id: string; name: string | null } | null;
  checklistItem?: {
    id: string;
    notes: string | null;
    completionType: "Activity" | "Voice" | "Upload";
    attachments: { id: string; url: string; name: string; mimeType: string | null }[];
  } | null;
};

export type ChecklistItem = {
  id: string; text: string; status: string; checked: boolean;
  completionType: "Activity" | "Voice" | "Upload";
  activities: { id: string; title: string; status: string; scheduledAt: string; type: string }[];
  pitstop: {
    id: string; title: string; targetDate: string | null; status: string; ownerId: string;
    owner: { id: string; name: string | null };
    goal: {
      id: string; title: string; needsDomain: string | null;
      linkedFacilityId?: string | null;
      needsCluster: { id: string; name: string } | null;
      needsSettlement?: { id: string; name: string } | null;
    };
  };
};

export type Goal = {
  id: string; title: string; status: string;
  needsDomain: string | null; needsClusterId: string | null; needsZoneId: string | null;
  parameter: number | null; outcomeCount: number | null;
  targetDate?: string | null;
  ownerId: string | null;
  owner: { id: string; name: string | null } | null;
  coOwners?: { userId: string }[];
  needsCluster?: { id: string; name: string } | null;
  pitstops: { id: string; status: string }[];
};

export type TeamMember = {
  id: string; name: string | null; image: string | null;
  rpClusters?: { id: string; name: string }[];
};

export type ZLTeamActivity = {
  id: string; title: string; type: string; scheduledAt: string;
  location?: string | null; status: string;
  attendees: { user: { id: string; name: string | null } }[];
  pitstops: {
    pitstop: {
      ownerId: string;
      targetDate: string | null;
      goal: {
        id: string; title: string; needsDomain: string | null; needsClusterId: string | null;
        needsCluster:    { id: string; name: string } | null;
        needsSettlement: { id: string; name: string } | null;
        needsZone:       { id: string; name: string } | null;
      };
    };
  }[];
};
