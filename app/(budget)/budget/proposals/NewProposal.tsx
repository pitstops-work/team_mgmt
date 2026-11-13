"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addStaffProposal } from "./actions";

/**
 * A staff-entered proposal.
 *
 * For solicited work — where we went to the organisation rather than the other
 * way round. It records the applicant's own name for themselves in
 * `applicantOrgName` and leaves the registry match to a separate, audited step,
 * because a near-match on an organisation name is a judgement and this project
 * has already watched the app agree with itself on a misspelt one.
 */
export default function NewProposal({
  windows,
}: {
  windows: { id: string; name: string; status: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    applicantOrgName: "",
    contactName: "",
    contactEmail: "",
    title: "",
    requestedAmount: "",
    city: "",
    domains: "",
    windowId: "",
  });

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function submit() {
    setError(null);
    start(async () => {
      const res = await addStaffProposal({
        applicantOrgName: form.applicantOrgName,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        title: form.title,
        requestedAmount: form.requestedAmount ? Number(form.requestedAmount) : null,
        city: form.city || null,
        domains: form.domains
          .split(",")
          .map((d) => d.trim())
          .filter(Boolean),
        windowId: form.windowId || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/budget/proposals/${res.proposalId}`);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-sky-600 hover:underline"
      >
        + Add a solicited proposal
      </button>
    );
  }

  const label = "block text-xs text-stone-500 mb-1";
  const input = "w-full rounded border border-stone-300 px-2 py-1.5 text-sm";

  return (
    <section className="rounded-lg border border-stone-200 p-4 space-y-3">
      <div className="text-xs uppercase tracking-wide text-stone-400">
        Solicited proposal
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Organisation, as they call themselves</label>
          <input className={input} value={form.applicantOrgName} onChange={(e) => set("applicantOrgName", e.target.value)} />
        </div>
        <div>
          <label className={label}>Title</label>
          <input className={input} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label className={label}>Contact name</label>
          <input className={input} value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </div>
        <div>
          <label className={label}>Contact email</label>
          <input className={input} type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
        </div>
        <div>
          <label className={label}>Amount requested (₹)</label>
          <input className={input} inputMode="decimal" value={form.requestedAmount} onChange={(e) => set("requestedAmount", e.target.value)} />
        </div>
        <div>
          <label className={label}>City</label>
          <input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <label className={label}>Domains, comma separated</label>
          <input className={input} value={form.domains} onChange={(e) => set("domains", e.target.value)} />
        </div>
        <div>
          <label className={label}>Against a call</label>
          <select className={input} value={form.windowId} onChange={(e) => set("windowId", e.target.value)}>
            <option value="">None — standalone</option>
            {windows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.status})
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded bg-stone-800 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add it"}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-stone-500">
          Cancel
        </button>
      </div>
    </section>
  );
}
