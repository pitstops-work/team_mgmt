import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getCategory } from "@/lib/wiki/articles";
import { CategoryGrid } from "../../_components/CategoryGrid";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ programDomain?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    return <div className="p-6 text-sm text-stone-500">Sign in to view.</div>;
  }

  const { category } = await params;
  const { programDomain = "Elderly" } = await searchParams;
  const cat = await getCategory(category, programDomain);
  if (!cat) notFound();

  return <CategoryGrid title={cat.title} description={cat.description} articles={cat.articles} />;
}
