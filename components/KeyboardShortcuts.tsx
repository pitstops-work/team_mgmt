"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

const SHORTCUTS = [
  { keys: "g g", description: "Go to Goals (Dashboard)" },
  { keys: "g p", description: "Go to All Pitstops" },
  { keys: "g c", description: "Go to Gantt Chart" },
  { keys: "g n", description: "Go to Notifications" },
  { keys: "?", description: "Show this shortcuts help" },
  { keys: "⌘K", description: "Open search" },
];

export default function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);
  const lastKey = useRef<string | null>(null);
  const lastKeyTime = useRef<number>(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) return;

      // Skip if modifier keys are held (except shift for ?)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const key = e.key;
      const now = Date.now();

      if (key === "?") {
        e.preventDefault();
        setShowHelp(v => !v);
        lastKey.current = null;
        return;
      }

      if (key === "Escape" && showHelp) {
        setShowHelp(false);
        return;
      }

      // Two-key sequences (g + x)
      if (lastKey.current === "g" && now - lastKeyTime.current < 500) {
        if (key === "g") { e.preventDefault(); router.push("/dashboard"); }
        else if (key === "p") { e.preventDefault(); router.push("/pitstops"); }
        else if (key === "c") { e.preventDefault(); router.push("/gantt"); }
        else if (key === "n") { e.preventDefault(); router.push("/notifications"); }
        lastKey.current = null;
        return;
      }

      if (key === "g") {
        lastKey.current = "g";
        lastKeyTime.current = now;
        return;
      }

      lastKey.current = null;
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, showHelp]);

  if (!showHelp) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setShowHelp(false); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-stone-200 w-full max-w-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-900">Keyboard Shortcuts</h2>
        </div>
        <div className="px-5 py-3">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-stone-50">
              {SHORTCUTS.map((s) => (
                <tr key={s.keys}>
                  <td className="py-2 pr-4">
                    <kbd className="inline-block font-mono text-xs bg-stone-100 text-stone-600 border border-stone-200 rounded px-2 py-0.5 whitespace-nowrap">
                      {s.keys}
                    </kbd>
                  </td>
                  <td className="py-2 text-stone-600 text-xs">{s.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-stone-100 bg-stone-50">
          <p className="text-[10px] text-stone-400">Press <kbd className="font-mono bg-stone-100 border border-stone-200 rounded px-1">Esc</kbd> or click outside to close</p>
        </div>
      </div>
    </div>
  );
}
