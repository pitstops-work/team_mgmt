"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, X, Send, RotateCcw, ChevronDown } from "lucide-react";

type Message = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS = [
  { label: "Analyze my progress", prompt: "Analyze the overall progress across all goals and pitstops. Highlight what's on track, what's at risk, and what needs attention." },
  { label: "Calendarize my year", prompt: "Look at all the goals and pitstops and suggest a realistic schedule for the year. For pitstops missing start or target dates, suggest dates based on their position in the goal and team capacity. Present it as a month-by-month plan." },
  { label: "Suggest meetings/events", prompt: "Based on the current pitstops and their status, suggest specific meetings, site visits, or events that should be scheduled. Include who should attend and when." },
  { label: "How is the team doing?", prompt: "Give me a workload and progress summary per team member. Who is overloaded? Who is ahead? Who might need support?" },
  { label: "Improve goal breakdowns", prompt: "Review each goal's pitstops and checklists. Suggest improvements — missing steps, better sequencing, pitstops that should be broken down further, or checklists that would help." },
  { label: "What's overdue?", prompt: "List everything that is overdue or at risk of being overdue based on today's date and target dates. Be specific about what needs immediate attention." },
];

function MarkdownText({ text }: { text: string }) {
  // Simple markdown: bold, bullets, headings
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <p key={i} className="text-xs font-bold text-stone-800 mt-2">{line.slice(4)}</p>;
        if (line.startsWith("## ")) return <p key={i} className="text-xs font-bold text-stone-900 mt-2">{line.slice(3)}</p>;
        if (line.startsWith("# ")) return <p key={i} className="text-sm font-bold text-stone-900 mt-2">{line.slice(2)}</p>;
        if (line.startsWith("- ") || line.startsWith("* ")) {
          const content = line.slice(2);
          return <div key={i} className="flex gap-1.5 text-xs text-stone-700"><span className="text-stone-400 flex-shrink-0 mt-0.5">•</span><span dangerouslySetInnerHTML={{ __html: boldify(content) }} /></div>;
        }
        if (line.match(/^\d+\. /)) {
          const content = line.replace(/^\d+\. /, "");
          const num = line.match(/^(\d+)/)?.[1];
          return <div key={i} className="flex gap-1.5 text-xs text-stone-700"><span className="text-stone-400 flex-shrink-0 w-3">{num}.</span><span dangerouslySetInnerHTML={{ __html: boldify(content) }} /></div>;
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return <p key={i} className="text-xs text-stone-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: boldify(line) }} />;
      })}
    </div>
  );
}

function boldify(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showActions, setShowActions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setShowActions(false);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!res.ok || !res.body) throw new Error("Failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: full } : m));
      }
    } catch {
      setMessages(prev => prev.map((m, i) => i === prev.length - 1 ? { ...m, content: "Sorry, something went wrong. Please try again." } : m));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const reset = () => { setMessages([]); setInput(""); setShowActions(true); };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
          open ? "bg-stone-800 text-white" : "bg-sky-500 hover:bg-sky-600 text-white"
        }`}
        title="AI Assistant"
      >
        {open ? <X className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-36 right-4 sm:bottom-20 sm:right-6 z-40 w-[calc(100vw-2rem)] sm:w-96 h-[60vh] sm:h-[600px] bg-white rounded-2xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between bg-gradient-to-r from-sky-500 to-violet-500">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-white" />
              <span className="text-sm font-semibold text-white">Pitstop AI</span>
              <span className="text-[10px] text-white/70 bg-white/20 px-1.5 py-0.5 rounded-full">Llama 3.3</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button onClick={reset} title="New conversation" className="p-1.5 text-white/70 hover:text-white transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 text-white/70 hover:text-white transition-colors">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && showActions && (
              <div className="space-y-3">
                <p className="text-xs text-stone-400 text-center pt-2">
                  Ask me anything about your goals, progress, schedule, or team.
                </p>
                <div className="space-y-1.5">
                  {QUICK_ACTIONS.map(a => (
                    <button key={a.label} onClick={() => send(a.prompt)}
                      className="w-full text-left px-3 py-2 text-xs text-stone-700 bg-stone-50 hover:bg-sky-50 hover:text-sky-700 border border-stone-200 hover:border-sky-200 rounded-lg transition-colors">
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "user" ? (
                  <div className="max-w-[80%] px-3 py-2 bg-sky-500 text-white text-xs rounded-2xl rounded-tr-sm leading-relaxed">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[92%] px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-2xl rounded-tl-sm">
                    {m.content ? (
                      <MarkdownText text={m.content} />
                    ) : (
                      <div className="flex gap-1 items-center py-0.5">
                        <span className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-1.5 h-1.5 bg-stone-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-stone-100">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your goals, schedule, team…"
                rows={1}
                disabled={loading}
                className="flex-1 px-3 py-2 text-xs border border-stone-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50 max-h-24 overflow-y-auto"
                style={{ fieldSizing: "content" } as React.CSSProperties}
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-xl transition-colors"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-stone-300 mt-1.5 text-center">Powered by Groq · Llama 3.3 70B</p>
          </div>
        </div>
      )}
    </>
  );
}
