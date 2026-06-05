"use client";

import { useCallback, useState } from "react";
import { SpinePanel } from "./SpinePanel";
import { ForkPanel } from "./ForkPanel";
import type { Panel, SpineWithEntries } from "@/lib/wiki/articles";

type OpenPanel = {
  /** Stable key for React: `${questionArticleId}::${panel}` */
  key: string;
  questionArticleId: string;
  questionTitle: string;
  panel: Panel;
  folded: boolean;
};

export function PanelStackManager({ spine }: { spine: SpineWithEntries }) {
  const [panels, setPanels] = useState<OpenPanel[]>([]);

  const openFork = useCallback((questionArticleId: string, questionTitle: string, panel: Panel) => {
    const key = `${questionArticleId}::${panel}`;
    setPanels((prev) => {
      // Toggle: if already open, unfold + bring to front (right-most).
      const existing = prev.find((p) => p.key === key);
      if (existing) {
        return [...prev.filter((p) => p.key !== key), { ...existing, folded: false }];
      }
      return [...prev, { key, questionArticleId, questionTitle, panel, folded: false }];
    });
  }, []);

  const toggleFold = useCallback((key: string) => {
    setPanels((prev) => prev.map((p) => (p.key === key ? { ...p, folded: !p.folded } : p)));
  }, []);

  const closePanel = useCallback((key: string) => {
    setPanels((prev) => prev.filter((p) => p.key !== key));
  }, []);

  const activePanels = panels.map((p) => ({ questionArticleId: p.questionArticleId, panel: p.panel }));

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] overflow-x-auto bg-stone-100">
      <SpinePanel spine={spine} onOpenFork={openFork} activePanels={activePanels} />
      {panels.map((p) => (
        <ForkPanel
          key={p.key}
          questionArticleId={p.questionArticleId}
          questionTitle={p.questionTitle}
          panel={p.panel}
          folded={p.folded}
          onToggleFold={() => toggleFold(p.key)}
          onClose={() => closePanel(p.key)}
        />
      ))}
    </div>
  );
}
