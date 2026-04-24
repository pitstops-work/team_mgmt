"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Sidebar button (desktop)
export default function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => { setInstalled(true); setDeferredPrompt(null); });
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed || !deferredPrompt) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") { setInstalled(true); setDeferredPrompt(null); }
  };

  return (
    <button
      onClick={handleInstall}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors w-full"
      title="Install Pitstop app"
    >
      <Download className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
      Install App
    </button>
  );
}

// Mobile sticky banner — shown above the bottom nav on Android
export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }
    // Check if user previously dismissed
    if (sessionStorage.getItem("pwa-banner-dismissed")) {
      setDismissed(true);
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => { setInstalled(true); setDeferredPrompt(null); });
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed || dismissed || !deferredPrompt) return null;

  const handleInstall = async () => {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    sessionStorage.setItem("pwa-banner-dismissed", "1");
    setDismissed(true);
  };

  return (
    <div className="sm:hidden fixed bottom-16 left-0 right-0 z-50 mx-3 mb-2">
      <div className="flex items-center gap-3 bg-sky-600 text-white px-4 py-3 rounded-xl shadow-lg">
        <img src="/icon-192.png" alt="" className="w-8 h-8 rounded-lg flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Install Pitstop</p>
          <p className="text-xs text-sky-200 leading-tight">Add to home screen for the best experience</p>
        </div>
        <button
          onClick={handleInstall}
          className="flex-shrink-0 bg-white text-sky-600 text-xs font-semibold px-3 py-1.5 rounded-lg"
        >
          Install
        </button>
        <button onClick={handleDismiss} className="flex-shrink-0 text-sky-300 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
