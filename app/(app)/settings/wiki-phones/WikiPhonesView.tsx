"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Save, Upload, Phone } from "lucide-react";

type Row = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  whatsappOptIn: boolean;
  designation: string;
};

type PhoneEdit = { id: string; phone: string };

export default function WikiPhonesView({ initialUsers }: { initialUsers: Row[] }) {
  const [users, setUsers] = useState<Row[]>(initialUsers);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [csv, setCsv] = useState("");
  const [csvPreview, setCsvPreview] = useState<PhoneEdit[] | null>(null);
  const [csvUnmatched, setCsvUnmatched] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const phoneByEmail = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => {
      if (u.phone) m.set(u.email.toLowerCase(), u.phone);
    });
    return m;
  }, [users]);

  const idByEmail = useMemo(() => {
    const m = new Map<string, string>();
    users.forEach((u) => m.set(u.email.toLowerCase(), u.id));
    return m;
  }, [users]);

  function setEdit(id: string, phone: string) {
    setEdits((prev) => ({ ...prev, [id]: phone }));
  }

  const pendingUpdates: PhoneEdit[] = useMemo(() => {
    const out: PhoneEdit[] = [];
    users.forEach((u) => {
      const draft = edits[u.id];
      if (draft === undefined) return;
      const next = draft.trim();
      const cur = u.phone ?? "";
      if (next !== cur) out.push({ id: u.id, phone: next });
    });
    return out;
  }, [users, edits]);

  function previewCsv() {
    const lines = csv
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: PhoneEdit[] = [];
    const unmatched: string[] = [];
    for (const line of lines) {
      const [emailRaw, phoneRaw] = line.split(",").map((s) => s?.trim() ?? "");
      if (!emailRaw) continue;
      const email = emailRaw.toLowerCase();
      const id = idByEmail.get(email);
      if (!id) {
        unmatched.push(emailRaw);
        continue;
      }
      // skip header row that looks like email,phone
      if (email === "email" && phoneRaw?.toLowerCase() === "phone") continue;
      if (phoneByEmail.get(email) === (phoneRaw || null)) continue;
      parsed.push({ id, phone: phoneRaw || "" });
    }
    setCsvPreview(parsed);
    setCsvUnmatched(unmatched);
  }

  function applyCsvPreview() {
    if (!csvPreview) return;
    const next: Record<string, string> = { ...edits };
    csvPreview.forEach((p) => {
      next[p.id] = p.phone;
    });
    setEdits(next);
    setCsv("");
    setCsvPreview(null);
    setCsvUnmatched([]);
  }

  async function save() {
    if (pendingUpdates.length === 0) return;
    setSaving(true);
    const res = await fetch("/api/admin/wiki/phones", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: pendingUpdates.map((u) => ({ userId: u.id, phone: u.phone })),
      }),
    });
    setSaving(false);
    if (!res.ok) return;
    // Refresh local state to mirror what we just saved.
    setUsers((prev) =>
      prev.map((u) => {
        const e = edits[u.id];
        if (e === undefined) return u;
        return { ...u, phone: e.trim() || null };
      }),
    );
    setEdits({});
    setSavedAt(new Date());
  }

  return (
    <main className="min-h-screen bg-stone-50">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Settings
        </Link>

        <h1 className="text-2xl font-semibold text-stone-900 mb-2 inline-flex items-center gap-2">
          <Phone className="w-5 h-5 text-stone-600" />
          Wiki phones
        </h1>
        <p className="text-sm text-stone-600 mb-6">
          Capture phone numbers so WhatsApp digests can fire once the provider is wired up.
          Internal users default to <span className="font-medium">opt-in</span>; flip below to opt out.
        </p>

        {/* ── CSV importer ─────────────────────────────────────────── */}
        <section className="bg-white border border-stone-200 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold text-stone-800 mb-2 inline-flex items-center gap-1.5">
            <Upload className="w-4 h-4" />
            Bulk import (CSV)
          </h2>
          <p className="text-xs text-stone-500 mb-2">
            One row per line: <code className="bg-stone-100 px-1 rounded">email,phone</code>.
            Numbers should be E.164 (e.g. <code className="bg-stone-100 px-1 rounded">+919812345678</code>).
            Header row optional.
          </p>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={4}
            placeholder="someone@org.in,+919812345678"
            className="w-full px-3 py-2 border border-stone-300 rounded-md bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stone-400"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={previewCsv}
              disabled={!csv.trim()}
              className="px-3 py-1.5 border border-stone-300 rounded-md text-sm text-stone-700 hover:border-stone-500 disabled:opacity-50"
            >
              Preview
            </button>
          </div>

          {csvPreview && (
            <div className="mt-3 border-t border-stone-200 pt-3">
              <div className="text-xs text-stone-500 mb-2">
                {csvPreview.length} change{csvPreview.length === 1 ? "" : "s"} found
                {csvUnmatched.length > 0
                  ? ` · ${csvUnmatched.length} unmatched email${csvUnmatched.length === 1 ? "" : "s"}`
                  : ""}
              </div>
              {csvUnmatched.length > 0 && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
                  Unmatched: {csvUnmatched.join(", ")}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setCsvPreview(null); setCsvUnmatched([]); }}
                  className="px-3 py-1.5 text-sm text-stone-600 hover:text-stone-900"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={applyCsvPreview}
                  disabled={csvPreview.length === 0}
                  className="px-3 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50"
                >
                  Stage {csvPreview.length} change{csvPreview.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Inline grid ─────────────────────────────────────────── */}
        <section className="bg-white border border-stone-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Phone</th>
                <th className="text-left px-3 py-2">WA opt-in</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const draft = edits[u.id];
                const value = draft !== undefined ? draft : (u.phone ?? "");
                const dirty = draft !== undefined && draft.trim() !== (u.phone ?? "");
                return (
                  <tr key={u.id} className="border-t border-stone-100">
                    <td className="px-3 py-2 text-stone-800">{u.name ?? "—"}</td>
                    <td className="px-3 py-2 text-stone-600">{u.email}</td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => setEdit(u.id, e.target.value)}
                        placeholder="+91…"
                        className={`w-44 px-2 py-1 border rounded text-sm font-mono ${
                          dirty ? "border-amber-400 bg-amber-50" : "border-stone-300 bg-white"
                        }`}
                      />
                    </td>
                    <td className="px-3 py-2 text-stone-600">
                      {u.whatsappOptIn ? "Yes" : "No"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="mt-4 flex items-center justify-end gap-3">
          {savedAt && (
            <span className="text-xs text-emerald-700">Saved {savedAt.toLocaleTimeString()}</span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={saving || pendingUpdates.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-stone-900 text-white rounded-md text-sm hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving
              ? "Saving…"
              : pendingUpdates.length === 0
                ? "No changes"
                : `Save ${pendingUpdates.length} change${pendingUpdates.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </main>
  );
}
