"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPathRef = useRef(pathname);

  // Start bar on link click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor || !anchor.href || anchor.target) return;
      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname) return;
        setVisible(true);
        setWidth(15);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setWidth(60), 150);
      } catch {}
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  // Complete bar when pathname changes
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      setWidth(100);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 400);
    }
  }, [pathname]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] h-0.5 pointer-events-none">
      <div
        className="h-full bg-sky-500 transition-all ease-out"
        style={{ width: `${width}%`, transitionDuration: width === 100 ? "200ms" : "400ms" }}
      />
    </div>
  );
}
