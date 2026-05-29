"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createTemplate } from "./actions";

export default function NewTemplateButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => {
        const name = prompt("New template name (e.g. Childcare Centre)");
        if (!name) return;
        start(async () => {
          const r = await createTemplate(name);
          router.push(`/models/templates/${r.id}`);
        });
      }}
      disabled={pending}
      className="text-sm bg-sky-600 text-white px-4 py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50"
    >
      {pending ? "Creating…" : "+ New template"}
    </button>
  );
}
