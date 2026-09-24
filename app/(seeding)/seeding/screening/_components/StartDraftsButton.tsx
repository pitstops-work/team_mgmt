"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startDrafts } from "../actions";

export default function StartDraftsButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() =>
        start(async () => {
          await startDrafts();
          setDone(true);
          router.refresh();
        })
      }
      disabled={pending}
      className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:border-stone-400 disabled:opacity-50"
    >
      {pending ? "Starting…" : done ? "Started" : "Run first reads now"}
    </button>
  );
}
