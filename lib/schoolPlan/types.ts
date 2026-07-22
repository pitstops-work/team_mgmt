// Local type aliases so completeness.ts / rules.ts don't need the generated
// Prisma client at type level (avoids import cycles + speeds cold start).

export type SchoolPlanStepStatusValue =
  | "pending" | "in_progress" | "done" | "blocked" | "not_applicable";

export type SchoolPlanStatusValue = "draft" | "for_review" | "approved";

export type SchoolStaffPayrollValue = "us" | "anchor" | "specialist" | "agency";

export type SchoolServiceStatusValue = "ok" | "gap" | "unknown";

export type SchoolComponentDeliveryValue = "us" | "anchor" | "specialist" | "agency";
