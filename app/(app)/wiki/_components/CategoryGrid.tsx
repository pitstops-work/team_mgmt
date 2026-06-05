"use client";

import Link from "next/link";
import { SurfaceProvider } from "@/components/rbac/RbacProviders";
import type { ArticleSummary } from "@/lib/wiki/articles";

export function CategoryGrid({
  title,
  description,
  articles,
}: {
  title: string;
  description: string;
  articles: ArticleSummary[];
}) {
  return (
    <SurfaceProvider id="wiki.category">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <header className="mb-6">
          <Link href="/wiki" className="text-xs text-stone-500 hover:underline">← Wiki</Link>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">{title}</h1>
          <p className="mt-1 text-sm text-stone-600">{description}</p>
          <div className="mt-2 text-xs text-stone-400">{articles.length} article{articles.length === 1 ? "" : "s"}</div>
        </header>

        {articles.length === 0 ? (
          <div className="rounded-md border border-dashed border-stone-300 p-6 text-sm text-stone-500">
            No articles in this category yet.
          </div>
        ) : (
          <ol className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {articles.map((art) => (
              <li key={art.id}>
                <Link
                  href={`/wiki/a/${art.slug}`}
                  className="block px-4 py-3 hover:bg-amber-50"
                >
                  <div className="text-sm font-medium text-stone-900">{art.title}</div>
                  <div className="mt-0.5 text-xs text-stone-500">{art.slug}</div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SurfaceProvider>
  );
}
