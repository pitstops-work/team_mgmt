"use client";

import { Paperclip } from "lucide-react";
import Avatar from "@/components/Avatar";

type Attachment = { id: string; name: string; url: string; type: string; mimeType?: string | null };
type Message = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string | null; image: string | null };
  attachments: Attachment[];
  mentions: { user: { id: string; name: string | null } }[];
};

interface Props {
  message: Message;
  isOwn: boolean;
}

function formatBody(body: string): string {
  // Convert @[Name](userId) to @Name
  return body.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " at " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function MessageBubble({ message, isOwn }: Props) {
  return (
    <div className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
      <Avatar name={message.author.name} image={message.author.image} size="sm" />
      <div className={`max-w-xl ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className={`flex items-baseline gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
          <span className="text-xs font-medium text-stone-700">{message.author.name}</span>
          <span className="text-xs text-stone-400">{formatDate(message.createdAt)}</span>
        </div>
        <div
          className={`px-3.5 py-2.5 rounded-xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isOwn
              ? "bg-sky-500 text-white rounded-tr-sm"
              : "bg-white border border-stone-200 text-stone-800 rounded-tl-sm"
          }`}
        >
          {formatBody(message.body)}
        </div>
        {message.attachments.length > 0 && (
          <div className={`flex flex-wrap gap-1.5 ${isOwn ? "justify-end" : ""}`}>
            {message.attachments.map((att) => (
              <a
                key={att.id}
                href={att.url}
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
