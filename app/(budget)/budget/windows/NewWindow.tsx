"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveWindow } from "../proposals/actions";

/** A call starts as a draft. Opening it is a separate, guarded act. */
export default function NewWindow() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm text-sky-600 hover:underline">
        + New call
      </button>
    );
  }

  const input = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";

  return (
    <section className="rounded-lg border border-stone-200 p-4 space-y-3">
      <div className="text-xs uppercase tracking-wide text-stone-400">New call</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Name</label>
          <input
            className={input}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) {
                setSlug(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, ""),
                );
              }
            }}
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">
            Slug — the public web address
          </label>
          <input className={input} value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button
          className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => {
            setError(null);
            start(async () => {
              const res = await saveWindow({ name, slug });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.push(`/budget/windows/${res.windowId}`);
            });
          }}
        >
          {pending ? "Saving…" : "Create as draft"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-stone-500">
          Cancel
        </button>
      </div>
    </section>
  );
}
