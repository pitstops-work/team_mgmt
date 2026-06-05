"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, FileText, Mic, X } from "lucide-react";
import type { Activity } from "../_lib/types";
import { fmtDate, fmtDateShort, fmtDomain, fmtTime } from "../_lib/helpers";
import { ACTIVITY_TYPE_STYLE } from "../_lib/constants";
import { EmptyState, SectionTitle } from "../_shared/Primitives";
import { useCan } from "@/components/rbac/RbacProviders";

/**
 * RP "Done log" — replaces the legacy `Past` tab for the RP designation.
 *
 * Chronological feed (newest first) of activities the RP has personally
 * completed. Renders:
 *  - completion timestamp + original schedule time
 *  - goal / cluster / settlement / domain chips
 *  - voice transcription (notes) inline when present
 *  - photo thumbnails (lightbox on click)
 *
 * Groups by day so the RP can read their week back at a glance.
 *
 * Notes on data: voice URLs are not persisted server-side today (the voice
 * route stores the transcription as ChecklistItem.notes and discards the
 * blob URL after transcription). Until that's fixed, the Done log shows
 * the transcript only; uploaded photos render as thumbnails directly.
 */
export function DoneLog({
  userId,
  doneActivities,
}: {
  userId: string;
  doneActivities: Activity[];
}) {
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);

  // Group by completion day. Falls back to scheduledAt if completedAt missing
  // on a legacy row (shouldn't happen post-enrichment, but defensive).
  const groups = useMemo(() => {
    const byDay = new Map<string, { label: string; items: Activity[] }>();
    for (const a of doneActivities) {
      const when = a.completedAt ?? a.scheduledAt;
      const d = new Date(when);
      const key = d.toDateString();
      if (!byDay.has(key)) byDay.set(key, { label: dayLabel(d), items: [] });
      byDay.get(key)!.items.push(a);
    }
    // Already ordered desc from the server, so map iteration is correct.
    return [...byDay.entries()].map(([k, v]) => ({ key: k, ...v }));
  }, [doneActivities]);

  if (doneActivities.length === 0) {
    return <EmptyState message="No completed activities in the last 30 days." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-stone-500">
          {doneActivities.length} activit{doneActivities.length === 1 ? "y" : "ies"} completed · last 30 days
        </p>
      </div>

      {groups.map(g => (
        <section key={g.key}>
          <SectionTitle>{g.label}</SectionTitle>
          <div className="space-y-2">
            {g.items.map(a => (
              <DoneEntry key={a.id} activity={a} onOpenLightbox={setLightbox} />
            ))}
          </div>
        </section>
      ))}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-full max-w-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

function DoneEntry({
  activity,
  onOpenLightbox,
}: {
  activity: Activity;
  onOpenLightbox: (img: { url: string; name: string }) => void;
}) {
  const canReadPitstop = useCan("pitstop", "read");
  const goal = activity.pitstops?.[0]?.pitstop.goal;
  const ps = activity.pitstops?.[0]?.pitstop;
  const ci = activity.checklistItem ?? null;
  const domain = goal?.needsDomain ? fmtDomain(goal.needsDomain) : null;
  const cluster = goal?.needsCluster?.name;
  const settlement = goal?.needsSettlement?.name;
  const completionType = ci?.completionType ?? "Activity";

  const attachments = ci?.attachments ?? [];
  const photos = attachments.filter(
    a => a.mimeType?.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(a.name)
  );
  const audios = attachments.filter(
    a => a.mimeType?.startsWith("audio/") || /\.(webm|ogg|mp3|mp4|m4a|wav)$/i.test(a.name)
  );
  const files = attachments.filter(a => !photos.includes(a) && !audios.includes(a));

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3 flex gap-3">
      {/* Left rail: timestamp + icon */}
      <div className="flex-shrink-0 w-20 text-right">
        <p className="text-[11px] font-semibold text-emerald-700 tabular-nums">
          {activity.completedAt ? fmtTime(activity.completedAt) : fmtTime(activity.scheduledAt)}
        </p>
        <p className="text-[10px] text-stone-400 mt-0.5">
          {activity.completedAt && activity.completedAt.slice(0, 10) !== activity.scheduledAt.slice(0, 10)
            ? `was ${fmtDateShort(activity.scheduledAt)}`
            : ""}
        </p>
        <div className="mt-2 flex justify-end">
          {completionType === "Voice" ? <Mic className="w-3 h-3 text-sky-500" /> :
           completionType === "Upload" ? <Camera className="w-3 h-3 text-violet-500" /> :
           <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ps?.id && canReadPitstop ? (
            <Link href={`/pitstops/${ps.id}`} className="text-sm font-medium text-stone-800 hover:text-sky-700 truncate">
              {activity.title}
            </Link>
          ) : (
            <span className="text-sm font-medium text-stone-800 truncate">{activity.title}</span>
          )}
          {activity.type && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${ACTIVITY_TYPE_STYLE[activity.type] ?? "bg-stone-100 text-stone-600"}`}>
              {activity.type}
            </span>
          )}
        </div>
        {(settlement || cluster || domain || goal?.title) && (
          <p className="text-[11px] text-stone-400 mt-0.5 truncate">
            {[settlement, cluster, domain, goal?.title].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Voice playback + transcription */}
        {(audios.length > 0 || ci?.notes) && (
          <div className="mt-2 p-2 rounded-lg bg-sky-50/50 border border-sky-100 space-y-2">
            {audios.map(a => (
              <audio key={a.id} controls preload="metadata" src={a.url} className="w-full h-8" />
            ))}
            {ci?.notes && (
              <p className="text-xs text-stone-700 whitespace-pre-wrap">{ci.notes}</p>
            )}
          </div>
        )}

        {/* Photo thumbnails */}
        {photos.length > 0 && (
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {photos.map(p => (
              <button
                key={p.id}
                onClick={() => onOpenLightbox({ url: p.url, name: p.name })}
                className="w-14 h-14 rounded-lg overflow-hidden border border-stone-200 bg-stone-50 hover:border-sky-300 transition-colors"
              >
                <img src={p.url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}

        {/* Non-image files */}
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map(f => (
              <a
                key={f.id}
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-stone-600 hover:text-sky-600"
              >
                <FileText className="w-3 h-3" />
                {f.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function dayLabel(d: Date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const test = new Date(d);
  test.setHours(0, 0, 0, 0);
  if (test.getTime() === today.getTime())     return "Today";
  if (test.getTime() === yesterday.getTime()) return "Yesterday";
  return fmtDate(d.toISOString());
}
