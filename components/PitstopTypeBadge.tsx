type PitstopType =
  | "Meeting" | "Training" | "SiteVisit" | "Discussion"
  | "AppDevelopment" | "Budgeting" | "Proposal" | "Research"
  | "Review" | "Custom";

const labels: Record<PitstopType, string> = {
  Meeting: "Meeting",
  Training: "Training",
  SiteVisit: "Site Visit",
  Discussion: "Discussion",
  AppDevelopment: "App Development",
  Budgeting: "Budgeting",
  Proposal: "Proposal",
  Research: "Research",
  Review: "Review",
  Custom: "Custom",
};

const icons: Record<PitstopType, string> = {
  Meeting: "👥",
  Training: "📚",
  SiteVisit: "📍",
  Discussion: "💬",
  AppDevelopment: "💻",
  Budgeting: "💰",
  Proposal: "📄",
  Research: "🔬",
  Review: "🔍",
  Custom: "⚡",
};

export default function PitstopTypeBadge({ type }: { type: PitstopType }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-stone-500">
      <span>{icons[type]}</span>
      <span>{labels[type]}</span>
    </span>
  );
}

export { labels as pitstopTypeLabels, icons as pitstopTypeIcons };
