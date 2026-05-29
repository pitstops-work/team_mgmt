import type { NotificationType } from "@/app/generated/prisma/client";

export type WikiNotificationKind =
  | "wiki_flag_created"
  | "wiki_comment_created"
  | "wiki_weekly_digest"
  | "wiki_review_overdue"
  | "wiki_review_steward_14d"
  | "wiki_review_steward_30d"
  | "wiki_owner_term_expiring"
  | "wiki_owner_term_expired"
  | "wiki_handover_proposed"
  | "wiki_circle_prompt"
  | "wiki_gap_assigned"
  | "wiki_gap_resolved"
  | "wiki_gap_published"
  | "wiki_shadow_recorded"
  | "wiki_page_orphaned";

export type ChannelName = "push" | "inApp" | "email";

export interface DispatchInput {
  userId: string;
  kind: WikiNotificationKind;
  pageId?: string | null;
  title: string;
  body?: string;
  link?: string;
}

export interface AdapterResult {
  channel: ChannelName;
  status: "sent" | "skipped" | "failed";
  error?: string;
}

export const WIKI_KIND_TO_NOTIFICATION_TYPE: Record<
  WikiNotificationKind,
  NotificationType
> = {
  wiki_flag_created: "WikiFlagCreated",
  wiki_comment_created: "WikiCommentCreated",
  wiki_weekly_digest: "WikiWeeklyDigest",
  wiki_review_overdue: "WikiReviewOverdue",
  wiki_review_steward_14d: "WikiReviewOverdue",
  wiki_review_steward_30d: "WikiReviewOverdue",
  wiki_owner_term_expiring: "WikiOwnerTermExpiring",
  wiki_owner_term_expired: "WikiOwnerTermExpired",
  wiki_handover_proposed: "WikiHandoverProposed",
  wiki_circle_prompt: "WikiCirclePrompt",
  wiki_gap_assigned: "WikiGapAssigned",
  wiki_gap_resolved: "WikiGapResolved",
  wiki_gap_published: "WikiGapPublished",
  wiki_shadow_recorded: "WikiShadowRecorded",
  wiki_page_orphaned: "WikiReviewOverdue",
};
