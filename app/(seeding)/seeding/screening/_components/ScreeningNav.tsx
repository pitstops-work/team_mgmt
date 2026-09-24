import Link from "next/link";

export default function ScreeningNav({
  active,
  canImport,
  canConfigure,
}: {
  active: "queue" | "report" | "import" | "settings";
  canImport: boolean;
  canConfigure: boolean;
}) {
  const items = [
    { key: "queue", href: "/seeding/screening", label: "Applications", show: true },
    { key: "report", href: "/seeding/screening/report", label: "Report", show: true },
    { key: "import", href: "/seeding/screening/import", label: "Import", show: canImport },
    { key: "settings", href: "/seeding/screening/settings", label: "Settings", show: canConfigure },
  ].filter((i) => i.show);
  return (
    <nav className="flex gap-1 border-b border-stone-200 mb-5">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className={`px-3 py-2 text-sm -mb-px border-b-2 ${
            active === i.key ? "border-stone-900 text-stone-900 font-medium" : "border-transparent text-stone-500 hover:text-stone-800"
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
