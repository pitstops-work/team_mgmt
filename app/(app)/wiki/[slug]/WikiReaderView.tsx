"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import {
  Pencil,
  BookOpen,
  ArrowLeft,
  AlertCircle,
  MessageCircle,
  Flag,
  Plus,
  Check,
  X,
  CheckCircle2,
  CalendarCheck,
  Users,
  Handshake,
} from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
type ResolverUser = { id: string; name: string | null };
type Page = {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  canonicalContent: string;
  lastEditedAt: string;
  nextReviewDue: string | null;
  owner: User | null;
  ownerId: string | null;
  tags: { tagType: string; tagValue: string }[];
};
type Comment = {
  id: string;
  body: string;
  sectionAnchor: string | null;
  language: string;
  createdAt: string;
  resolvedAt: string | null;
  author: User;
  resolvedBy: ResolverUser | null;
};
type Flag = {
  id: string;
  reason: string;
  sectionAnchor: string | null;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  flagger: User;
};
type PendingReview = {
  id: string;
  type: string;
  scheduledFor: string;
  triggerCircle: { id: string; completedAt: string | null } | null;
  triggerPartnerReviewMeeting: {
    id: string;
    completedAt: string | null;
    partnerOrg: { name: string };
  } | null;
};

const TYPE_LABEL: Record<string, string> = {
  principle: "Principle",
  playbook: "Playbook",
  runbook: "Runbook",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const ms = Date.now() - t;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(iso);
}

type ComposerState = {
  kind: "comment" | "flag";
  anchor: string | null;
};

export default function WikiReaderView({
  page,
  initialComments,
  initialFlags,
  pendingReviews,
  currentUserId,
  isSteward,
}: {
  page: Page;
  initialComments: Comment[];
  initialFlags: Flag[];
  pendingReviews: PendingReview[];
  currentUserId: string;
  isSteward: boolean;
}) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [flags, setFlags] = useState<Flag[]>(initialFlags);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [composerText, setComposerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const canEdit = page.ownerId === currentUserId || isSteward;
  const canReview = canEdit;
  const reviewOverdueDays = useMemo(() => {
    if (!page.nextReviewDue) return 0;
    const diff = Date.now() - new Date(page.nextReviewDue).getTime();
    return diff <= 0 ? 0 : Math.floor(diff / (24 * 60 * 60 * 1000));
  }, [page.nextReviewDue]);
  const reviewOverdue = reviewOverdueDays > 0;

  async function markReviewed() {
    if (reviewing) return;
    if (!confirm("Mark this page as reviewed (no changes)?")) return;
    setReviewing(true);
    const res = await fetch(`/api/wiki/pages/${page.slug}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setReviewing(false);
    if (res.ok) router.refresh();
  }

  const openFlagCount = useMemo(
    () => flags.filter((f) => f.status !== "resolved").length,
    [flags],
  );
  const unresolvedCommentCount = useMemo(
    () => comments.filter((c) => !c.resolvedAt).length,
    [comments],
  );

  function openComposer(kind: "comment" | "flag", anchor: string | null) {
    setComposer({ kind, anchor });
    setComposerText("");
  }
  function closeComposer() {
    setComposer(null);
    setComposerText("");
  }

  async function submitComposer() {
    if (!composer || !composerText.trim()) return;
    setSubmitting(true);
    const url =
      composer.kind === "comment"
        ? `/api/wiki/pages/${page.slug}/comments`
        : `/api/wiki/pages/${page.slug}/flags`;
    const body =
      composer.kind === "comment"
        ? { body: composerText.trim(), sectionAnchor: composer.anchor }
        : { reason: composerText.trim(), sectionAnchor: composer.anchor };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (!res.ok) return;
    const data = await res.json();
    if (composer.kind === "comment") {
      setComments((prev) => [...prev, data.comment]);
    } else {
      setFlags((prev) => [...prev, data.flag]);
    }
    closeComposer();
  }

  async function resolveComment(id: string, resolved: boolean) {
    const res = await fetch(`/api/wiki/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setComments((prev) => prev.map((c) => (c.id === id ? data.comment : c)));
  }

  async function setFlagStatus(id: string, status: "open" | "acknowledged" | "resolved") {
    const res = await fetch(`/api/wiki/flags/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setFlags((prev) => prev.map((f) => (f.id === id ? data.flag : f)));
  }

  // Custom heading renderer — adds hover-revealed "+comment" / "+flag" buttons
  function makeHeadingComponent(level: 2 | 3) {
    return function Heading({
      id,
      children,
      ...rest
    }: ComponentProps<"h2"> & { id?: string }) {
      const Tag = level === 2 ? "h2" : "h3";
      return (
        <Tag id={id} {...rest} className="group relative scroll-mt-20">
          {children}
          {id && (
            <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity ml-2 inline-flex items-center gap-1 align-middle">
              <button
                type="button"
                onClick={() => openComposer("comment", id)}
                title="Comment on this section"
                className="inline-flex items-center justify-center w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 hover:text-stone-900 hover:border-stone-400"
              >
                <MessageCircle className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openComposer("flag", id)}
                title="Flag this section"
                className="inline-flex items-center justify-center w-6 h-6 rounded border border-stone-200 bg-white text-stone-500 hover:text-amber-600 hover:border-amber-300"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </Tag>
      );
    };
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link
          href="/wiki"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          All pages
        </Link>

        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8">
          {/* ─── Main column ─────────────────────────────────────────────── */}
          <div>
            <header className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-stone-500" />
                <span className="text-xs uppercase tracking-wide text-stone-500">
                  {TYPE_LABEL[page.type] ?? page.type}
                </span>
                {page.status === "draft" && (
                  <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Draft</span>
                )}
                {openFlagCount > 0 && (
                  <span className="text-xs text-red-700 bg-red-50 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                    <Flag className="w-3 h-3" />
                    {openFlagCount} open flag{openFlagCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div className="flex items-start justify-between gap-4">
                <h1 className="text-3xl font-semibold text-stone-900">{page.title}</h1>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openComposer("flag", null)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-md text-sm text-stone-700 hover:border-amber-400 hover:text-amber-700"
                  >
                    <Flag className="w-4 h-4" />
                    Flag
                  </button>
                  {canReview && (
                    <button
                      type="button"
                      onClick={markReviewed}
                      disabled={reviewing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-md text-sm text-stone-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
                      title="Mark reviewed without editing"
                    >
                      <CalendarCheck className="w-4 h-4" />
                      {reviewing ? "Saving…" : "Mark reviewed"}
                    </button>
                  )}
                  {canEdit && (
                    <Link
                      href={`/wiki/${page.slug}/edit`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-md text-sm text-stone-700 hover:border-stone-500"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit
                    </Link>
                  )}
                </div>
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
                  {reviewOverdueDays >= 30
                    ? `Over 30 days overdue — under steward review.`
                    : reviewOverdueDays >= 14
                      ? `${reviewOverdueDays} days overdue — stewards have been notified.`
                      : `${reviewOverdueDays} day${reviewOverdueDays === 1 ? "" : "s"} overdue — please review or edit.`}
                </div>
              )}

              {pendingReviews.map((pr) => {
                const isCircle = pr.type === "post_circle";
                const eventLink = isCircle
                  ? pr.triggerCircle
                    ? `/wiki/circles/${pr.triggerCircle.id}`
                    : null
                  : pr.triggerPartnerReviewMeeting
                    ? `/wiki/partner-reviews/${pr.triggerPartnerReviewMeeting.id}`
                    : null;
                const eventLabel = isCircle
                  ? "a practice circle"
                  : pr.triggerPartnerReviewMeeting
                    ? `partner review with ${pr.triggerPartnerReviewMeeting.partnerOrg.name}`
                    : "a partner review";
                const completedAt =
                  pr.triggerCircle?.completedAt ??
                  pr.triggerPartnerReviewMeeting?.completedAt ??
                  null;
                return (
                  <div
                    key={pr.id}
                    className="mt-3 flex items-start gap-2 bg-indigo-50 border border-indigo-200 text-indigo-800 px-3 py-2 rounded text-sm"
                  >
                    {isCircle ? (
                      <Users className="w-4 h-4 mt-0.5 shrink-0" />
                    ) : (
                      <Handshake className="w-4 h-4 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1">
                      Discussed in {eventLabel}
                      {completedAt && ` on ${fmtDate(completedAt)}`} — review and update or
                      mark reviewed within 7 days.
                      {eventLink && (
                        <>
                          {" "}
                          <Link href={eventLink} className="underline">
                            Open event
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </header>

            <article className="prose prose-stone max-w-none">
              <ReactMarkdown
                rehypePlugins={[rehypeSlug]}
                components={{
                  h2: makeHeadingComponent(2),
                  h3: makeHeadingComponent(3),
                }}
              >
                {page.canonicalContent}
              </ReactMarkdown>
            </article>

            {/* Inline composer */}
            {composer && (
              <div className="mt-6 bg-white border border-stone-300 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2 text-sm">
                  {composer.kind === "comment" ? (
                    <MessageCircle className="w-4 h-4 text-stone-500" />
                  ) : (
                    <Flag className="w-4 h-4 text-amber-600" />
                  )}
                  <span className="font-medium text-stone-800">
                    New {composer.kind}
                  </span>
                  {composer.anchor && (
                    <span className="text-xs text-stone-500">
                      on §{composer.anchor}
                    </span>
                  )}
                </div>
                <textarea
                  value={composerText}
                  onChange={(e) => setComposerText(e.target.value)}
                  placeholder={
                    composer.kind === "comment"
                      ? "What do you want to say?"
                      : "What's wrong with this section?"
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-stone-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                  autoFocus
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeComposer}
                    className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submitComposer}
                    disabled={submitting || !composerText.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded text-sm hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {submitting ? "Posting…" : "Post"}
                  </button>
                </div>
              </div>
            )}

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

          {/* ─── Activity rail ───────────────────────────────────────────── */}
          <aside className="mt-10 lg:mt-0">
            <ActivityPanel
              comments={comments}
              flags={flags}
              currentUserId={currentUserId}
              page={page}
              isSteward={isSteward}
              unresolvedCommentCount={unresolvedCommentCount}
              openFlagCount={openFlagCount}
              onResolveComment={resolveComment}
              onSetFlagStatus={setFlagStatus}
              onAddPageLevel={(kind) => openComposer(kind, null)}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

function ActivityPanel({
  comments,
  flags,
  currentUserId,
  page,
  isSteward,
  unresolvedCommentCount,
  openFlagCount,
  onResolveComment,
  onSetFlagStatus,
  onAddPageLevel,
}: {
  comments: Comment[];
  flags: Flag[];
  currentUserId: string;
  page: Page;
  isSteward: boolean;
  unresolvedCommentCount: number;
  openFlagCount: number;
  onResolveComment: (id: string, resolved: boolean) => void;
  onSetFlagStatus: (id: string, status: "open" | "acknowledged" | "resolved") => void;
  onAddPageLevel: (kind: "comment" | "flag") => void;
}) {
  return (
    <div className="lg:sticky lg:top-6 space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-stone-800 inline-flex items-center gap-1.5">
            <Flag className="w-4 h-4 text-amber-600" />
            Flags
            {openFlagCount > 0 && (
              <span className="text-xs bg-red-50 text-red-700 rounded-full px-1.5">
                {openFlagCount}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => onAddPageLevel("flag")}
            className="text-xs text-stone-500 hover:text-stone-900 inline-flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> Flag
          </button>
        </div>
        {flags.length === 0 ? (
          <p className="text-xs text-stone-500">No flags yet.</p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => {
              const canModerate =
                page.ownerId === currentUserId || isSteward || f.flagger.id === currentUserId;
              return (
                <li
                  key={f.id}
                  className={`bg-white border rounded p-2.5 text-sm ${
                    f.status === "resolved"
                      ? "border-stone-200 opacity-60"
                      : "border-amber-200"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                    <span>{f.flagger.name ?? "Someone"} · {fmtRelative(f.createdAt)}</span>
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        f.status === "open"
                          ? "bg-red-50 text-red-700"
                          : f.status === "acknowledged"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {f.status}
                    </span>
                  </div>
                  {f.sectionAnchor && (
                    <a
                      href={`#${f.sectionAnchor}`}
                      className="block text-[11px] text-stone-500 hover:text-stone-900 mb-1"
                    >
                      §{f.sectionAnchor}
                    </a>
                  )}
                  <p className="text-stone-800 whitespace-pre-wrap break-words">{f.reason}</p>
                  {canModerate && f.status !== "resolved" && (
                    <div className="flex items-center justify-end gap-2 mt-1.5">
                      {f.status === "open" && (page.ownerId === currentUserId || isSteward) && (
                        <button
                          type="button"
                          onClick={() => onSetFlagStatus(f.id, "acknowledged")}
                          className="text-xs text-stone-600 hover:text-stone-900"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSetFlagStatus(f.id, "resolved")}
                        className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900"
                      >
                        <Check className="w-3 h-3" />
                        Resolve
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-stone-800 inline-flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4 text-stone-500" />
            Comments
            {unresolvedCommentCount > 0 && (
              <span className="text-xs bg-stone-100 text-stone-700 rounded-full px-1.5">
                {unresolvedCommentCount}
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={() => onAddPageLevel("comment")}
            className="text-xs text-stone-500 hover:text-stone-900 inline-flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> Comment
          </button>
        </div>
        {comments.length === 0 ? (
          <p className="text-xs text-stone-500">No comments yet.</p>
        ) : (
          <ul className="space-y-2">
            {comments.map((c) => {
              const canModerate =
                c.author.id === currentUserId ||
                page.ownerId === currentUserId ||
                isSteward;
              return (
                <li
                  key={c.id}
                  className={`bg-white border border-stone-200 rounded p-2.5 text-sm ${c.resolvedAt ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                    <span>{c.author.name ?? "Someone"} · {fmtRelative(c.createdAt)}</span>
                    {c.resolvedAt && (
                      <span className="text-[10px] uppercase tracking-wide bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                        Resolved
                      </span>
                    )}
                  </div>
                  {c.sectionAnchor && (
                    <a
                      href={`#${c.sectionAnchor}`}
                      className="block text-[11px] text-stone-500 hover:text-stone-900 mb-1"
                    >
                      §{c.sectionAnchor}
                    </a>
                  )}
                  <p className="text-stone-800 whitespace-pre-wrap break-words">{c.body}</p>
                  {canModerate && (
                    <div className="flex items-center justify-end gap-2 mt-1.5">
                      {c.resolvedAt ? (
                        <button
                          type="button"
                          onClick={() => onResolveComment(c.id, false)}
                          className="text-xs text-stone-500 hover:text-stone-900 inline-flex items-center gap-1"
                        >
                          <X className="w-3 h-3" />
                          Reopen
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onResolveComment(c.id, true)}
                          className="text-xs text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Resolve
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
