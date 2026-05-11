import "./review-portal.css";
import { auth } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/roleGuard";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Review Portal",
  description: "Grant note drafting and review",
};

export default async function ReviewLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!isSuperAdmin(session)) redirect("/portal");
  return <>{children}</>;
}
