import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isWikiSteward } from "@/lib/wiki/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil, BookOpen, ArrowLeft, AlertCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

const TYPE_LABEL: Record<string, string> = {
  principle: "Principle",
  playbook: "Playbook",
  runbook: "Runbook",
};

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function WikiPageReader({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const page = await prisma.wikiPage.findUnique({
    where: { slug },
    include: {
      owner: { select: { id: true, name: true, image: true } },
      lastEditor: { select: { id: true, name: true } },
      tags: { select: { tagType: true, tagValue: true } },
    },
  });
  if (!page || page.archivedAt) notFound();

  const steward = userId ? await isWikiSteward(userId) : false;
  const canEdit = (userId && page.ownerId === userId) || steward;

  const reviewOverdue =
    page.nextReviewDue && new Date(page.nextReviewDue) < new Date();

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link
          href="/wiki"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          All pages
        </Link>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-stone-500" />
            <span className="text-xs uppercase tracking-wide text-stone-500">
              {TYPE_LABEL[page.type] ?? page.type}
            </span>
            {page.status === "draft" && (
              <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Draft</span>
            )}
          </div>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-semibold text-stone-900">{page.title}</h1>
            {canEdit && (
              <Link
                href={`/wiki/${page.slug}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-md text-sm text-stone-700 hover:border-stone-500 shrink-0"
              >
                <Pencil className="w-4 h-4" />
                Edit
              </Link>
            )}
          </div>
          <div className="mt-3 text-sm text-stone-500 flex flex-wrap gap-x-4 gap-y-1">
            <span>Owner: {page.owner?.name ?? "Unowned"}</span>
            <span>Last edited: {fmtDate(page.lastEditedAt)}</span>
            {page.nextReviewDue && (
              <span className={reviewOverdue ? "text-red-600 font-medium" : ""}>
                Next review: {fmtDate(page.nextReviewDue)}
              </span>
            )}
          </div>
          {reviewOverdue && (
            <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
              <AlertCircle className="w-4 h-4" />
              This page is overdue for review.
            </div>
          )}
        </header>

        <article className="prose prose-stone max-w-none">
          <ReactMarkdown>{page.canonicalContent}</ReactMarkdown>
        </article>

        {page.tags.length > 0 && (
          <div className="mt-8 pt-4 border-t border-stone-200">
            <div className="text-xs text-stone-500 mb-1">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {page.tags.map((t) => (
                <span
                  key={`${t.tagType}:${t.tagValue}`}
                  className="text-xs px-2 py-0.5 bg-white border border-stone-200 rounded-full text-stone-600"
                >
                  {t.tagType}: {t.tagValue}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
