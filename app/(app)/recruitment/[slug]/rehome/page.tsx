import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";
import { auth } from "@/lib/auth";
import { buildRbacContext, can } from "@/lib/rbac";
import prisma from "@/lib/prisma";
import RehomeClient from "./RehomeClient";

export const dynamic = "force-dynamic";

/** Sort an Unplaced desk out by home state. See lib/recruitment/rehome.ts. */
export default async function RehomePage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth();
  const ctx = await buildRbacContext(session, { surface: "recruitment.list" });
  if (!(await can(ctx, "recruitment", "create"))) notFound();

  const { slug } = await params;
  const day = await prisma.recruitmentScoutingDay.findUnique({ where: { slug }, select: { title: true, jobId: true } });
  if (!day) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-1">
        <Link href={`/recruitment/${slug}`} className="text-stone-400 hover:text-stone-600">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <MapPin className="w-5 h-5 text-sky-500" />
        <h1 className="text-lg font-semibold text-stone-900">Move people to their home-state desk</h1>
      </div>
      <p className="text-sm text-stone-500 mb-6 leading-relaxed">
        From <span className="text-stone-700">{day.title}</span>: Uttar Pradesh → Ayodhya or Varanasi (whichever is
        nearer), north-east states → Guwahati, Odisha → the nearest Odisha city, Karnataka → Bangalore. Everyone else
        stays. Each person is re-scouted against their new city, and their scores and notes go with them.
      </p>
      {day.jobId ? (
        <RehomeClient slug={slug} />
      ) : (
        <p className="text-sm text-rose-700">This desk isn&apos;t linked to a JD, so there are no cities to move to.</p>
      )}
    </div>
  );
}
