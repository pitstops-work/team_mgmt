"use client";

import { useEffect, useMemo, useState, type ComponentProps } from "react";
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
  Send,
} from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
type ResolverUser = { id: string; name: string | null };
type Page = {
  id: string;
  slug: string;
  title: string;
  type: string;
  status: string;
  canonicalLang: string;
  canonicalContent: string;
  translatedContent: Record<
    string,
    { content: string; translatedAt: string; machineTranslated: boolean }
  > | null;
  lastEditedAt: string;
  nextReviewDue: string | null;
  ownerTermEnd: string | null;
  owner: User | null;
  ownerId: string | null;
  tags: { tagType: string; tagValue: string }[];
};
type PendingHandover = {
  id: string;
  handoverNote: string | null;
  createdAt: string;
  fromUser: { id: string; name: string | null };
  toUser: { id: string; name: string | null };
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

const LANG_LABELS: Record<string, string> = {
  en: "English",
  ta: "தமிழ்",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  hi: "हिन्दी",
  bn: "বাংলা",
};

export default function WikiReaderView({
  page,
  initialComments,
  initialFlags,
  pendingReviews,
  pendingHandover,
  currentUserId,
  isSteward,
  preferredLang,
}: {
  page: Page;
  initialComments: Comment[];
  initialFlags: Flag[];
  pendingReviews: PendingReview[];
  pendingHandover: PendingHandover | null;
  currentUserId: string;
  isSteward: boolean;
  preferredLang: string;
}) {
  const router = useRouter();
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [flags, setFlags] = useState<Flag[]>(initialFlags);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [composerText, setComposerText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverBusy, setHandoverBusy] = useState(false);
  const [mobileActivityOpen, setMobileActivityOpen] = useState(false);

  const isOwner = page.ownerId === currentUserId;
  const canEdit = isOwner || isSteward;
  const canReview = canEdit;
  const reviewOverdueDays = useMemo(() => {
    if (!page.nextReviewDue) return 0;
    const diff = Date.now() - new Date(page.nextReviewDue).getTime();
    return diff <= 0 ? 0 : Math.floor(diff / (24 * 60 * 60 * 1000));
  }, [page.nextReviewDue]);
  const reviewOverdue = reviewOverdueDays > 0;

  const daysToTermEnd = useMemo(() => {
    if (!page.ownerTermEnd) return null;
    const diff = new Date(page.ownerTermEnd).getTime() - Date.now();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }, [page.ownerTermEnd]);
  const termEndingSoon = daysToTermEnd !== null && daysToTermEnd >= 0 && daysToTermEnd <= 30;

  // ── Translation state ─────────────────────────────────────────────────
  const availableLangs = useMemo(() => {
    const langs = [page.canonicalLang];
    if (page.translatedContent) {
      for (const lang of Object.keys(page.translatedContent)) {
        if (lang !== page.canonicalLang && page.translatedContent[lang]?.content) {
          langs.push(lang);
        }
      }
    }
    return langs;
  }, [page.canonicalLang, page.translatedContent]);

  const initialLang =
    preferredLang !== page.canonicalLang && availableLangs.includes(preferredLang)
      ? preferredLang
      : page.canonicalLang;
  const [activeLang, setActiveLang] = useState(initialLang);
  const isTranslation = activeLang !== page.canonicalLang;
  const activeTranslation = isTranslation ? page.translatedContent?.[activeLang] : null;
  const displayContent = isTranslation
    ? (activeTranslation?.content ?? page.canonicalContent)
    : page.canonicalContent;

  const [translationFlagOpen, setTranslationFlagOpen] = useState(false);
  const [translationFlagReason, setTranslationFlagReason] = useState("");
  const [translationFlagBusy, setTranslationFlagBusy] = useState(false);
  const [translationFlagSubmitted, setTranslationFlagSubmitted] = useState(false);

  async function submitTranslationFlag() {
    if (!translationFlagReason.trim()) return;
    setTranslationFlagBusy(true);
    const res = await fetch(`/api/wiki/pages/${page.slug}/translation-flags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: activeLang, reason: translationFlagReason.trim() }),
    });
    setTranslationFlagBusy(false);
    if (res.ok) {
      setTranslationFlagSubmitted(true);
      setTranslationFlagReason("");
      setTimeout(() => {
        setTranslationFlagOpen(false);
        setTranslationFlagSubmitted(false);
      }, 1500);
    }
  }

  async function renewTerm() {
    if (!confirm("Renew your owner term by 6 months?")) return;
    setHandoverBusy(true);
    const res = await fetch(`/api/wiki/pages/${page.slug}/renew-term`, { method: "POST" });
    setHandoverBusy(false);
    if (res.ok) router.refresh();
  }

  async function decideHandover(id: string, action: "accept" | "decline") {
    if (action === "accept" && !confirm("Take over ownership of this page?")) return;
    setHandoverBusy(true);
    const res = await fetch(`/api/wiki/handovers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setHandoverBusy(false);
    if (res.ok) router.refresh();
  }

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

  async function publishPage() {
    if (publishing) return;
    if (!confirm("Publish this page? It will be visible to everyone and start the review cycle.")) return;
    setPublishing(true);
    const res = await fetch(`/api/wiki/pages/${page.slug}/publish`, {
      method: "POST",
    });
    setPublishing(false);
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
              <div className="flex items-center gap-2 mb-2 flex-wrap">
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
                {availableLangs.length > 1 && (
                  <select
                    value={activeLang}
                    onChange={(e) => setActiveLang(e.target.value)}
                    className="ml-auto text-xs px-2 py-0.5 border border-stone-300 rounded bg-white"
                    title="Language"
                  >
                    {availableLangs.map((l) => (
                      <option key={l} value={l}>
                        {LANG_LABELS[l] ?? l}
                        {l === page.canonicalLang ? " (canonical)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {isTranslation && activeTranslation && (
                <div className="text-xs text-stone-500 mb-2 flex items-center gap-2 flex-wrap">
                  <span>
                    Machine-translated
                    {activeTranslation.translatedAt
                      ? ` · ${fmtDate(activeTranslation.translatedAt)}`
                      : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTranslationFlagOpen(true)}
                    className="underline hover:text-stone-900"
                  >
                    Flag translation
                  </button>
                </div>
              )}
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
                  {canReview && page.status === "draft" && (
                    <button
                      type="button"
                      onClick={publishPage}
                      disabled={publishing}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-300 bg-emerald-50 text-emerald-700 rounded-md text-sm hover:border-emerald-500 hover:bg-emerald-100 disabled:opacity-50"
                      title="Publish this draft"
                    >
                      <Send className="w-4 h-4" />
                      {publishing ? "Publishing…" : "Publish"}
                    </button>
                  )}
                  {canReview && page.status !== "draft" && (
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

              {page.status === "orphaned" && (
                <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-300 text-amber-900 px-3 py-2 rounded text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    This page is orphaned — it needs an owner.
                    {isSteward && (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={() => setHandoverOpen(true)}
                          className="underline"
                        >
                          Assign an owner
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {pendingHandover && pendingHandover.toUser.id === currentUserId && (
                <div className="mt-3 flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-900 px-3 py-2 rounded text-sm">
                  <div className="flex-1">
                    {pendingHandover.fromUser.name ?? "Someone"} is handing this page over to you.
                    {pendingHandover.handoverNote && (
                      <div className="mt-1 text-sky-800 italic">"{pendingHandover.handoverNote}"</div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => decideHandover(pendingHandover.id, "accept")}
                        disabled={handoverBusy}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-700 text-white rounded text-xs hover:bg-emerald-800 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Accept ownership
                      </button>
                      <button
                        type="button"
                        onClick={() => decideHandover(pendingHandover.id, "decline")}
                        disabled={handoverBusy}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded text-xs text-stone-700 hover:border-stone-500 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {pendingHandover &&
                pendingHandover.toUser.id !== currentUserId &&
                (isOwner || isSteward) && (
                  <div className="mt-3 flex items-start gap-2 bg-stone-50 border border-stone-300 text-stone-700 px-3 py-2 rounded text-sm">
                    <div className="flex-1">
                      Handover pending: <strong>{pendingHandover.toUser.name ?? "user"}</strong> has been
                      asked to take over. Waiting on their response.
                    </div>
                  </div>
                )}

              {termEndingSoon && isOwner && !pendingHandover && (
                <div className="mt-3 flex items-start gap-2 bg-indigo-50 border border-indigo-200 text-indigo-900 px-3 py-2 rounded text-sm">
                  <div className="flex-1">
                    Your owner term ends in {daysToTermEnd} day{daysToTermEnd === 1 ? "" : "s"}.
                    Renew or hand the page over so it doesn't get orphaned.
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={renewTerm}
                        disabled={handoverBusy}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-700 text-white rounded text-xs hover:bg-indigo-800 disabled:opacity-50"
                      >
                        Renew 6 months
                      </button>
                      <button
                        type="button"
                        onClick={() => setHandoverOpen(true)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 border border-stone-300 rounded text-xs text-stone-700 hover:border-stone-500"
                      >
                        Hand over
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </header>

            {handoverOpen && (
              <HandoverDialog
                pageSlug={page.slug}
                currentUserId={currentUserId}
                onClose={() => setHandoverOpen(false)}
                onCreated={() => router.refresh()}
              />
            )}

            {translationFlagOpen && (
              <div
                className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4"
                onClick={() => setTranslationFlagOpen(false)}
              >
                <div
                  className="bg-white border border-stone-200 rounded-lg shadow-xl max-w-md w-full p-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 className="text-lg font-semibold text-stone-900 mb-1">
                    Flag this translation
                  </h2>
                  <p className="text-xs text-stone-500 mb-3">
                    Tell a steward what's wrong with the {LANG_LABELS[activeLang] ?? activeLang} translation.
                    Goes to the translation queue.
                  </p>
                  {translationFlagSubmitted ? (
                    <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded">
                      Flag submitted. Thanks.
                    </div>
                  ) : (
                    <>
                      <textarea
                        value={translationFlagReason}
                        onChange={(e) => setTranslationFlagReason(e.target.value)}
                        rows={4}
                        placeholder="What's wrong with this translation?"
                        autoFocus
                        className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
                      />
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setTranslationFlagOpen(false)}
                          className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={submitTranslationFlag}
                          disabled={translationFlagBusy || !translationFlagReason.trim()}
                          className="px-4 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50"
                        >
                          {translationFlagBusy ? "Sending…" : "Send"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <article className="prose prose-stone max-w-none">
              <ReactMarkdown
                rehypePlugins={[rehypeSlug]}
                components={{
                  h2: makeHeadingComponent(2),
                  h3: makeHeadingComponent(3),
                }}
              >
                {displayContent}
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

          {/* ─── Activity rail (desktop) ─────────────────────────────────── */}
          <aside className="hidden lg:block mt-10 lg:mt-0">
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

      {/* ─── Mobile activity sheet ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setMobileActivityOpen(true)}
        className="lg:hidden fixed bottom-20 right-4 z-40 inline-flex items-center gap-2 bg-stone-900 text-white rounded-full shadow-lg px-4 py-2 text-sm hover:bg-stone-800"
      >
        <MessageCircle className="w-4 h-4" />
        Activity
        {(unresolvedCommentCount + openFlagCount) > 0 && (
          <span className="bg-white/20 px-1.5 py-0.5 rounded-full text-xs">
            {unresolvedCommentCount + openFlagCount}
          </span>
        )}
      </button>

      {mobileActivityOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/30 flex items-end"
          onClick={() => setMobileActivityOpen(false)}
        >
          <div
            className="bg-stone-50 w-full max-h-[80vh] rounded-t-2xl shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200">
              <span className="text-sm font-semibold text-stone-800">Activity</span>
              <button
                type="button"
                onClick={() => setMobileActivityOpen(false)}
                className="text-stone-400 hover:text-stone-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
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
                onAddPageLevel={(kind) => {
                  setMobileActivityOpen(false);
                  openComposer(kind, null);
                }}
              />
            </div>
          </div>
        </div>
      )}
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

function HandoverDialog({
  pageSlug,
  currentUserId,
  onClose,
  onCreated,
}: {
  pageSlug: string;
  currentUserId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  type U = { id: string; name: string | null; email: string };
  const [users, setUsers] = useState<U[] | null>(null);
  const [toUserId, setToUserId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((data: U[]) => setUsers(data.filter((u) => u.id !== currentUserId)));
  }, [currentUserId]);

  async function submit() {
    if (!toUserId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/wiki/pages/${pageSlug}/handover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId, handoverNote: note.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not propose handover");
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-stone-200 rounded-lg shadow-xl max-w-md w-full p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-stone-900 mb-1">Hand over ownership</h2>
        <p className="text-xs text-stone-500 mb-3">
          The person you pick will be notified. Ownership only transfers if they accept.
        </p>

        <label className="block text-sm font-medium text-stone-700 mb-1">New owner</label>
        <select
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400 mb-3"
        >
          <option value="">— Select —</option>
          {users === null
            ? <option disabled>Loading…</option>
            : users.map((u) => (
                <option key={u.id} value={u.id}>{u.name ?? u.email}</option>
              ))}
        </select>

        <label className="block text-sm font-medium text-stone-700 mb-1">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Why this person? Anything they should know?"
          className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-stone-400"
        />

        {error && (
          <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !toUserId}
            className="px-4 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Propose handover"}
          </button>
        </div>
      </div>
    </div>
  );
}

