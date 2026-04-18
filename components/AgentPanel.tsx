"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { useRef, useEffect, useState, useMemo } from "react";
import { Bot, X, Send, Loader2, ChevronDown, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

const transport = new DefaultChatTransport({ api: "/api/agent" });

export default function AgentPanel() {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, stop, setMessages, status } =
    useChat({ transport });

  const isLoading = status === "streaming" || status === "submitted";

  // Scroll on new content
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Focus input when opening
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    setInputText("");
    // reset textarea height
    if (inputRef.current) inputRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasMessages = messages.length > 0;

  const SUGGESTIONS = [
    "Which zones have the most coverage gaps?",
    "Plan a visit to all settlements in Zone 2 next Tuesday",
    "Summarise overdue goals and who owns them",
    "Create a goal for water coverage in cluster X",
  ];

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-24 sm:bottom-8 left-4 sm:left-6 z-[70] flex items-center justify-center w-11 h-11 rounded-full shadow-lg transition-all duration-200 ${
          open ? "bg-stone-700" : "bg-stone-900 hover:bg-stone-700 hover:scale-105"
        }`}
        title="AI Agent"
      >
        {open ? <X className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-white" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-40 sm:bottom-24 left-4 sm:left-6 z-[65] flex flex-col w-[92vw] sm:w-[420px] max-h-[70vh] sm:max-h-[600px] bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-stone-100 bg-stone-900 rounded-t-2xl flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Agent</p>
              <p className="text-[10px] text-stone-400">Claude claude-sonnet-4-6</p>
            </div>
            <div className="flex items-center gap-1">
              {hasMessages && (
                <button
                  onClick={() => setMessages([])}
                  className="p-1.5 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
                  title="Clear conversation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-stone-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 min-h-0">
            {!hasMessages && (
              <div className="py-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mx-auto">
                  <Bot className="w-6 h-6 text-stone-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-700">What do you need?</p>
                  <p className="text-xs text-stone-400 mt-1">I can analyse, plan, and create — ask me anything.</p>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => {
                        setInputText(s);
                        setTimeout(() => inputRef.current?.focus(), 50);
                      }}
                      className="text-xs px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-lg transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => {
              const isUser = m.role === "user";
              const textContent = m.parts
                .filter(isTextUIPart)
                .map(p => p.text)
                .join("");

              // Show tool-use indicator for assistant messages with no text yet
              if (!isUser && !textContent && isLoading && i === messages.length - 1) {
                return (
                  <div key={m.id} className="flex items-center gap-2 text-xs text-stone-400 py-1">
                    <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                    <span>Fetching data…</span>
                  </div>
                );
              }

              if (!textContent) return null;

              return (
                <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    isUser
                      ? "bg-stone-900 text-white rounded-br-sm"
                      : "bg-stone-100 text-stone-800 rounded-bl-sm"
                  }`}>
                    {isUser ? (
                      <p className="whitespace-pre-wrap">{textContent}</p>
                    ) : (
                      <div className="prose prose-sm prose-stone max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:text-xs prose-code:text-xs">
                        <ReactMarkdown>{textContent}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-stone-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-400" />
                  <span className="text-xs text-stone-400">Thinking…</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 border-t border-stone-100 px-3 py-2.5">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything or give me a task…"
                rows={1}
                className="flex-1 resize-none text-sm bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-stone-300 max-h-32 overflow-y-auto leading-relaxed"
                style={{ minHeight: "38px" }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = Math.min(el.scrollHeight, 128) + "px";
                }}
              />
              {isLoading ? (
                <button
                  type="button"
                  onClick={() => stop()}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-500 rounded-xl transition-colors"
                  title="Stop"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!inputText.trim()}
                  className="flex-shrink-0 w-9 h-9 flex items-center justify-center bg-stone-900 hover:bg-stone-700 text-white rounded-xl transition-colors disabled:opacity-40"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-[10px] text-stone-300 text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}
