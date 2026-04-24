"use client";

import { useState } from "react";
import { Paperclip, Mic, ChevronDown, ChevronUp } from "lucide-react";
import Avatar from "@/components/Avatar";

type Attachment = { id: string; name: string; url: string; type: string; mimeType?: string | null };
type Message = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  attachments: Attachment[];
  mentions: { user: { id: string; name: string | null } }[];
  msgType?: string;
  audioUrl?: string | null;
  originalLang?: string;
  translations?: Record<string, string> | null;
  translating?: boolean;
};

const LANG_LABELS: Record<string, string> = {
  en: "English", ta: "Tamil", kn: "Kannada", ml: "Malayalam", hi: "Hindi", bn: "Bengali",
};

interface Props {
  message: Message;
  isOwn: boolean;
  preferredLang: string;
}

function formatBody(body: string): string {
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " at " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function MessageBubble({ message, isOwn, preferredLang }: Props) {
  const [showOriginal, setShowOriginal] = useState(false);

  const isVoice = message.msgType === "voice";
  const originalLang = message.originalLang ?? "en";
  const translations = message.translations as Record<string, string> | null | undefined;
  const isTranslating = message.translating === true && !translations;

  // Resolve which text the viewer sees
  const isTranslated = !isTranslating && originalLang !== preferredLang && !!translations?.[preferredLang];
  const displayText = isTranslated ? translations![preferredLang] : message.body;

  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      <Avatar name={message.author.name} image={message.author.image} size="sm" />
      <div className={`max-w-xl ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
        {/* Author + time */}
        <div className={`flex items-baseline gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
          <span className="text-xs font-medium text-stone-700">{message.author.name}</span>
          {isVoice && <Mic className="w-3 h-3 text-stone-400" />}
          <span className="text-xs text-stone-400">{formatDate(message.createdAt)}</span>
        </div>

        {/* Bubble */}
        <div
          className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isOwn
              ? "bg-sky-500 text-white rounded-tr-sm"
              : "bg-white border border-stone-200 text-stone-800 rounded-tl-sm"
          }`}
        >
          {/* Audio player — proxied through /api/audio to handle private blob auth */}
          {isVoice && message.audioUrl && (
            <audio
              controls
              src={`/api/audio?url=${encodeURIComponent(message.audioUrl)}`}
              className="mb-2 w-full max-w-xs h-8"
              style={{ colorScheme: isOwn ? "dark" : "light" }}
            />
          )}

          {/* Display text (translated or original) */}
          <span>{formatBody(displayText)}</span>

          {/* Translating indicator */}
          {isTranslating && (
            <p className={`mt-1 text-xs italic opacity-60 ${isOwn ? "text-sky-100" : "text-stone-400"}`}>
              Translating…
            </p>
          )}

          {/* Translation toggle */}
          {isTranslated && (
            <button
              onClick={() => setShowOriginal((v) => !v)}
              className={`mt-1.5 flex items-center gap-1 text-xs opacity-60 hover:opacity-100 transition-opacity ${isOwn ? "text-white" : "text-stone-500"}`}
            >
              {showOriginal ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {showOriginal ? "Hide original" : `Show original (${LANG_LABELS[originalLang] ?? originalLang})`}
            </button>
          )}

          {/* Original text */}
          {isTranslated && showOriginal && (
            <p className={`mt-1.5 pt-1.5 border-t text-xs italic ${isOwn ? "border-sky-400 text-sky-100" : "border-stone-200 text-stone-400"}`}>
              {formatBody(message.body)}
            </p>
          )}
        </div>

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${isOwn ? "justify-end" : ""}`}>
            {message.attachments.map((att) => (
              <a
                key={att.id}
                href={`/api/attachment/${att.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-md transition-colors"
              >
                <Paperclip className="w-3 h-3" />
                {att.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
