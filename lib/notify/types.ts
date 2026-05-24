import type { NotificationType } from "@/app/generated/prisma/client";

export type WikiNotificationKind =
  | "wiki_flag_created"
  | "wiki_comment_created"
  | "wiki_weekly_digest"
  | "wiki_review_overdue"
  | "wiki_review_steward_14d"
  | "wiki_review_steward_30d"
  | "wiki_owner_term_expiring"
  | "wiki_circle_prompt";

export type ChannelName = "push" | "inApp" | "whatsapp";

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
  status: "sent" | "skipped" | "failed" | "intended_no_adapter";
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
  wiki_circle_prompt: "WikiCirclePrompt",
};
