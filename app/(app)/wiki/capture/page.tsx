import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import CaptureSheet from "./CaptureSheet";
import { isValidSectionNumber, type SectionNumber } from "@/lib/wiki/manual";

type SearchParams = Promise<{ manual?: string; page?: string; section?: string }>;

export default async function CapturePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { manual, page, section } = await searchParams;

  // Vertical taxonomy used for the gap path (also accepted on observations).
  // Source: NeedsFormulaConfig, same list /wiki/gaps uses, so the canonical
  // domain keys stay aligned.
  const verticals = await prisma.needsFormulaConfig.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { domain: true, label: true },
  });

  // Optional prefill — when capture is opened from a manual reader's "Add what
  // we learned" CTA the slug + section come as URL params.
  let prefillTarget: { id: string; slug: string; title: string; type: string; maturity: string | null; isSensitive: boolean } | null = null;
  if (manual || page) {
    const found = await prisma.wikiPage.findUnique({
      where: { slug: (manual ?? page)! },
      select: { id: true, slug: true, title: true, type: true, maturity: true, isSensitive: true, archivedAt: true },
    });
    if (found && !found.archivedAt) {
      prefillTarget = {
        id: found.id, slug: found.slug, title: found.title, type: found.type,
        maturity: found.maturity, isSensitive: found.isSensitive,
      };
    }
  }

  const sectionRaw = section ? Number(section) : NaN;
  const prefillSectionNumber: SectionNumber | null = isValidSectionNumber(sectionRaw) ? sectionRaw : null;

  return (
    <CaptureSheet
      verticals={verticals.map((v) => ({ domain: v.domain, label: v.label ?? v.domain }))}
      prefillTarget={prefillTarget}
      prefillSectionNumber={prefillSectionNumber}
    />
  );
}
