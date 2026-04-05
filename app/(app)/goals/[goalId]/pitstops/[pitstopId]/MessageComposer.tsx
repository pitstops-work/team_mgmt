"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, AtSign, X } from "lucide-react";

type User = { id: string; name: string | null; image: string | null };

interface Props {
  threadId: string;
  users: User[];
  onSent: (message: unknown) => void;
}

export default function MessageComposer({ threadId, users, onSent }: Props) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredUsers = users.filter((u) =>
    u.name?.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBody(val);

    // Check for @ mention trigger
    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const atIndex = textBeforeCursor.lastIndexOf("@");

    if (atIndex !== -1 && !textBeforeCursor.slice(atIndex + 1).includes(" ")) {
      setMentionStart(atIndex);
      setMentionSearch(textBeforeCursor.slice(atIndex + 1));
      setShowMentions(true);
    } else {
      setShowMentions(false);
      setMentionStart(-1);
    }
  };

  const handleMentionSelect = (user: User) => {
    if (mentionStart === -1) return;
    const before = body.slice(0, mentionStart);
    const after = body.slice(textareaRef.current?.selectionStart ?? 0);
    const mention = `@[${user.name}](${user.id})`;
    setBody(before + mention + " " + after);
    setShowMentions(false);
    setMentionStart(-1);
    textareaRef.current?.focus();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    if (res.ok) {
      const att = await res.json();
      setAttachments((prev) => [...prev, { id: att.id, name: att.name }]);
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (!body.trim() && attachments.length === 0) return;
    setSending(true);

    const res = await fetch(`/api/threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: body.trim(),
        attachmentIds: attachments.map((a) => a.id),
      }),
    });

    setSending(false);
    if (res.ok) {
      const message = await res.json();
      onSent(message);
      setBody("");
      setAttachments([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentions && (e.key === "Escape")) {
      setShowMentions(false);
      return;
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative">
      {/* Mention dropdown */}
      {showMentions && filteredUsers.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-56 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden z-10">
          {filteredUsers.map((u) => (
            <button
              key={u.id}
              onMouseDown={(e) => { e.preventDefault(); handleMentionSelect(u); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-stone-50 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs flex items-center justify-center font-medium">
                {u.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <span className="text-stone-700">{u.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-1 px-2 py-1 bg-stone-100 rounded-md text-xs text-stone-600">
              <Paperclip className="w-3 h-3" />
              {a.name}
              <button
                onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                className="text-stone-400 hover:text-stone-600 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a message... (⌘↵ to send, @ to mention)"
          rows={3}
          className="flex-1 px-3 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent resize-none placeholder:text-stone-400"
        />
        <div className="flex flex-col gap-1.5 pb-0.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors"
            title="Attach file"
          >
            {uploading ? <span className="text-xs">...</span> : <Paperclip className="w-4 h-4" />}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || (!body.trim() && attachments.length === 0)}
            className="p-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-lg transition-colors"
            title="Send (⌘↵)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
      />
    </div>
  );
}
