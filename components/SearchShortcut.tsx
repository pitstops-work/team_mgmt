"use client";

import { useEffect, useState } from "react";
import SearchModal from "./SearchModal";

export default function SearchShortcut() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const handleCustomEvent = () => setOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pitstop:search-open", handleCustomEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pitstop:search-open", handleCustomEvent);
    };
  }, []);

  return <SearchModal open={open} onClose={() => setOpen(false)} />;
}
