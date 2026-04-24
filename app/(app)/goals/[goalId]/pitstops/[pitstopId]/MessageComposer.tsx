"use client";

import { useState, useRef, useCallback } from "react";
import { Send, Paperclip, X, Mic, Square, Loader2 } from "lucide-react";

type User = { id: string; name: string | null; image: string | null };
type VoiceMessage = { id: string; translating?: boolean; translations?: Record<string, string> | null };

// Poll message until translations are populated, then call onUpdated
async function pollTranslations(messageId: string, onUpdated: (msg: unknown) => void) {
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const r = await fetch(`/api/messages/${messageId}`);
      if (!r.ok) break;
      const msg = await r.json();
      if (msg.translations) { onUpdated(msg); break; }
    } catch { break; }
  }
}

interface Props {
  threadId: string;
  users: User[];
  onSent: (message: unknown) => void;
  onMessageUpdated?: (message: unknown) => void;
  preferredLang?: string;
}

type RecordState = "idle" | "recording" | "processing";

export default function MessageComposer({ threadId, users, onSent, onMessageUpdated }: Props) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStart, setMentionStart] = useState(-1);
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [micError, setMicError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const filteredUsers = users.filter((u) =>
    u.name?.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBody(val);
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
    } else {
      const err = await res.json().catch(() => ({}));
      setMicError(err.error ?? "File upload failed. Please try again.");
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
      body: JSON.stringify({ body: body.trim(), attachmentIds: attachments.map((a) => a.id) }),
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
    if (showMentions && e.key === "Escape") { setShowMentions(false); return; }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSend(); }
  };

  // ── Voice recording ──────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecordState("processing");
        try {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const fd = new FormData();
          fd.append("audio", blob, `recording.${mimeType.includes("mp4") ? "mp4" : "webm"}`);
          const res = await fetch(`/api/threads/${threadId}/messages/voice`, { method: "POST", body: fd });
          if (res.ok) {
            const message: VoiceMessage = await res.json();
            onSent(message);
            // If translations are still being computed, poll until ready
            if (message.translating && onMessageUpdated) {
              pollTranslations(message.id, onMessageUpdated);
            }
          } else {
            setMicError("Voice message failed. Please try again.");
          }
        } catch {
          setMicError("Voice message failed. Please try again.");
        } finally {
          setRecordState("idle");
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecordState("recording");
    } catch {
      setMicError("Microphone access denied.");
    }
  }, [threadId, onSent]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }, []);

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
              <button onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))} className="text-stone-400 hover:text-stone-600 ml-0.5">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recording status */}
      {recordState === "recording" && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-xs text-red-600 font-medium">Recording… tap stop when done</span>
        </div>
      )}
      {recordState === "processing" && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl">
          <Loader2 className="w-3.5 h-3.5 text-stone-400 animate-spin" />
          <span className="text-xs text-stone-500">Transcribing &amp; translating…</span>
        </div>
      )}
      {micError && <p className="text-xs text-red-500 mb-2">{micError}</p>}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleBodyChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a message… (⌘↵ to send, @ to mention)"
          rows={3}
          disabled={recordState !== "idle"}
          className="flex-1 px-3 py-2.5 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent resize-none placeholder:text-stone-400 disabled:opacity-50"
        />
        <div className="flex flex-col gap-1.5 pb-0.5">
          {/* File attach */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || recordState !== "idle"}
            className="p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-lg transition-colors disabled:opacity-40"
            title="Attach file"
          >
            {uploading ? <span className="text-xs">…</span> : <Paperclip className="w-4 h-4" />}
          </button>

          {/* Voice record / stop */}
          {recordState === "idle" && (
            <button
              onClick={startRecording}
              className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Record voice message"
            >
              <Mic className="w-4 h-4" />
            </button>
          )}
          {recordState === "recording" && (
            <button
              onClick={stopRecording}
              className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors animate-pulse"
              title="Stop recording"
            >
              <Square className="w-4 h-4" />
            </button>
          )}
          {recordState === "processing" && (
            <button disabled className="p-2 text-stone-300 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
            </button>
          )}

          {/* Send text */}
          <button
            onClick={handleSend}
            disabled={sending || recordState !== "idle" || (!body.trim() && attachments.length === 0)}
            className="p-2 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-lg transition-colors"
            title="Send (⌘↵)"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
    </div>
  );
}
