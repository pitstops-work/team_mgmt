import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import { getArticleBySlug } from "@/lib/wiki/articles";
import { ArticleRenderer } from "../../_components/ArticleRenderer";
import { BacklinksPanel } from "../../_components/BacklinksPanel";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return <div className="p-6 text-sm text-stone-500">Sign in to view.</div>;
  }

  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  return (
    <SurfaceProvider id="wiki.article_view">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <nav className="mb-4 text-xs text-stone-500">
          <Link href="/wiki" className="hover:underline">Wiki</Link>
          <span className="mx-1.5">/</span>
          <span className="capitalize">{article.programDomain}</span>
          <span className="mx-1.5">/</span>
          <span className="text-stone-700">{article.kind.replace(/_/g, " ")}</span>
        </nav>

        <header className="mb-6 border-b border-stone-200 pb-4">
          <div className="text-[10px] uppercase tracking-wide text-stone-500">{article.kind.replace(/_/g, " ")}</div>
          <h1 className="mt-1 text-2xl font-semibold text-stone-900">{article.title}</h1>
          <div className="mt-2 text-xs text-stone-500">
            Last updated {article.updatedAt.toLocaleDateString()}
            {article.forkedFromId && <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-800">Forked</span>}
          </div>
        </header>

        <ArticleRenderer doc={article.contentJson} />

        <div className="mt-8">
          <BacklinksPanel backlinks={article.backlinks} />
        </div>
      </div>
    </SurfaceProvider>
  );
}
