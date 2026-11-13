import { notFound } from "next/navigation";
import { publicWindowBySlug } from "@/lib/budget/publicIntake";
import { draftForForm } from "@/lib/budget/publicIntake";
import ApplicationForm from "./ApplicationForm";

/**
 * The public application form.
 *
 * No session, no layout chrome from the app, nothing that links back into it.
 * Whoever reads this page is not a user of Pitstops and should not be invited
 * to become one.
 *
 * A call that does not exist is a 404. A call that exists but is not taking
 * submissions is a page that says so, with the date — an applicant who followed
 * a stale link deserves better than a 404 that reads as a broken website, and
 * "it closed on the 30th" is the one piece of information they actually need.
 *
 * `?ref=` + `?t=` reopens a saved draft in the same form, so the resume link
 * and the apply link are one route. If the token does not match, the page
 * silently offers a blank form rather than saying the reference is wrong:
 * confirming that a reference exists is itself the disclosure.
 */
export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string; t?: string }>;
}) {
  const { slug } = await params;
  const { ref, t } = await searchParams;

  const found = await publicWindowBySlug(slug);

  if (!found.ok && found.reason === "not_found") notFound();

  if (!found.ok) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 space-y-4">
        <h1 className="text-xl font-semibold text-stone-800">
          {found.name ?? "This call"} is not taking submissions
        </h1>
        <p className="text-sm text-stone-600">
          {found.reason === "closed" && found.closesOn
            ? `It closed on ${found.closesOn.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}.`
            : "It has not opened, or it has already closed."}
        </p>
        <p className="text-sm text-stone-500">
          If you have already applied, the link you saved still shows you where your
          application stands.
        </p>
      </main>
    );
  }

  const w = found.window;
  const draft = ref && t ? await draftForForm(ref, t) : null;

  // A submitted application must not reopen as an editable form. The status
  // page is where it lives from then on.
  if (draft && !draft.editable) {
    return (
      <main className="mx-auto max-w-xl px-4 py-12 space-y-4">
        <h1 className="text-xl font-semibold text-stone-800">This application is in with us</h1>
        <p className="text-sm text-stone-600">
          {draft.publicRef} was submitted
          {draft.submittedAt
            ? ` on ${draft.submittedAt.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}`
            : ""}
          , so it can no longer be changed here.
        </p>
        <a
          className="inline-block text-sm text-sky-700 underline"
          href={`/apply/status/${draft.publicRef}?t=${encodeURIComponent(t!)}`}
        >
          See where it stands
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-stone-400">Call for proposals</p>
        <h1 className="text-2xl font-semibold text-stone-800">{w.name}</h1>
        <p className="text-sm text-stone-500">
          {w.closesOn
            ? `Closes ${w.closesOn.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}`
            : "No closing date published"}
          {w.ceilingAmount ? ` · indicative ceiling ₹${w.ceilingAmount}` : ""}
        </p>
      </header>

      {w.brief && (
        <section className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-stone-400 mb-2">Guidance</div>
          <div className="text-sm text-stone-700 whitespace-pre-wrap">{w.brief}</div>
        </section>
      )}

      {w.ceilingAmount && (
        <p className="text-xs text-stone-500">
          The ceiling is indicative. A proposal above it is not refused for that reason
          alone, and is read like any other.
        </p>
      )}

      <ApplicationForm
        slug={w.slug}
        questions={w.questions}
        existing={
          draft
            ? { publicRef: draft.publicRef, resumeToken: t!, fields: draft.fields }
            : null
        }
      />
    </main>
  );
}
