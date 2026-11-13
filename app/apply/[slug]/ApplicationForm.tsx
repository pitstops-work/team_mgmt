"use client";

import { useState, useTransition } from "react";
import type { WindowQuestion } from "@/lib/budget/proposalVocabulary";
import { INTAKE_LIMITS } from "@/lib/budget/intakeLimits";
import { saveApplicationDraft } from "./actions";

/**
 * The applicant's form.
 *
 * Two things in here are not cosmetic.
 *
 * The resume link is shown on screen and the copy never claims an email was
 * sent, because none is: no sending domain is verified on this account, so
 * every message this app tries to send is refused by the provider and the SDK
 * returns an error object instead of throwing. Telling someone to "check their
 * inbox" would strand them with a half-finished application and no way back
 * to it. If mail is ever working, this is the place that should change.
 *
 * Saving does not require the form to be complete; submitting does. A form
 * that refuses to save until it is finished is a form people abandon with
 * everything typed and nothing kept — which is the entire reason the resume
 * token exists.
 */

/**
 * Hoisted out of the form on purpose.
 *
 * Declared inside the component, this is a NEW component type on every render,
 * so React unmounts and remounts its subtree — and the input inside it loses
 * focus after every single keystroke. The bug looks like a broken keyboard and
 * reads, in the code, like tidy colocation.
 */
function Field({
  message,
  children,
}: {
  message?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {children}
      {message && <p className="mt-1 text-xs text-red-700">{message}</p>}
    </div>
  );
}

type Fields = {
  applicantOrgName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  title: string;
  summary: string;
  requestedAmount: string;
  requestedMonths: string;
  city: string;
  domains: string[];
  answers: Record<string, unknown>;
};

const EMPTY: Fields = {
  applicantOrgName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  title: "",
  summary: "",
  requestedAmount: "",
  requestedMonths: "",
  city: "",
  domains: [],
  answers: {},
};

export default function ApplicationForm({
  slug,
  questions,
  existing,
}: {
  slug: string;
  questions: WindowQuestion[];
  existing: { publicRef: string; resumeToken: string; fields: Fields } | null;
}) {
  const [fields, setFields] = useState<Fields>(existing?.fields ?? EMPTY);
  const [publicRef, setPublicRef] = useState<string | null>(existing?.publicRef ?? null);
  const [resumeToken, setResumeToken] = useState<string | null>(existing?.resumeToken ?? null);
  const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, start] = useTransition();

  function set<K extends keyof Fields>(k: K, v: Fields[K]) {
    setFields((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }
  function setAnswer(key: string, v: unknown) {
    setFields((f) => ({ ...f, answers: { ...f.answers, [key]: v } }));
    setSaved(false);
  }

  const errFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const formError = errFor("_form") ?? errFor("_answers");

  function go(submit: boolean) {
    setErrors([]);
    setSaved(false);
    start(async () => {
      const res = await saveApplicationDraft({
        slug,
        publicRef: publicRef ?? undefined,
        resumeToken: resumeToken ?? undefined,
        submit,
        fields: {
          ...fields,
          domains: fields.domains,
          answers: fields.answers,
        },
      });
      if (!res.ok) {
        setErrors(res.errors);
        return;
      }
      setPublicRef(res.publicRef);
      if (res.resumeToken) setResumeToken(res.resumeToken);
      if (res.submitted) setSubmitted(true);
      else setSaved(true);
    });
  }

  const resumeUrl =
    publicRef && resumeToken
      ? `${typeof window === "undefined" ? "" : window.location.origin}/apply/${slug}?ref=${publicRef}&t=${resumeToken}`
      : null;
  const statusUrl =
    publicRef && resumeToken
      ? `${typeof window === "undefined" ? "" : window.location.origin}/apply/status/${publicRef}?t=${resumeToken}`
      : null;

  if (submitted) {
    return (
      <section className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-3">
        <h2 className="text-base font-semibold text-green-900">
          Your application is in with us
        </h2>
        <p className="text-sm text-green-900">
          Your reference is <span className="font-mono">{publicRef}</span>.
        </p>
        {statusUrl && (
          <>
            <p className="text-sm text-green-900">
              Keep this link. It is the only way to see where your application stands, and we
              have not sent it to you by email.
            </p>
            <code className="block break-all rounded border border-green-300 bg-white px-2 py-1.5 text-xs text-stone-700">
              {statusUrl}
            </code>
          </>
        )}
      </section>
    );
  }

  const label = "block text-sm text-stone-600 mb-1";
  const input =
    "w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-stone-500 focus:outline-none";

  return (
    <div className="space-y-6">
      {formError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {formError}
        </p>
      )}

      {saved && resumeUrl && (
        <section className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-2">
          <p className="text-sm font-medium text-sky-900">
            Saved. Your reference is <span className="font-mono">{publicRef}</span>.
          </p>
          <p className="text-sm text-sky-900">
            Save this link somewhere — it is how you come back to this application, and we
            have not emailed it to you. Anyone with the link can edit the application, so
            treat it like a password.
          </p>
          <code className="block break-all rounded border border-sky-300 bg-white px-2 py-1.5 text-xs text-stone-700">
            {resumeUrl}
          </code>
        </section>
      )}

      <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-4">
        <div className="text-xs uppercase tracking-wide text-stone-400">
          About your organisation
        </div>
        <Field message={errFor("applicantOrgName")}>
          <label className={label}>
            Organisation name <span className="text-red-600">*</span>
          </label>
          <input
            className={input}
            maxLength={INTAKE_LIMITS.shortText}
            value={fields.applicantOrgName}
            onChange={(e) => set("applicantOrgName", e.target.value)}
          />
          <p className="mt-1 text-xs text-stone-400">
            As your organisation writes it. We do not change what you type here.
          </p>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field message={errFor("contactName")}>
            <label className={label}>Who should we speak to?</label>
            <input
              className={input}
              maxLength={INTAKE_LIMITS.shortText}
              value={fields.contactName}
              onChange={(e) => set("contactName", e.target.value)}
            />
          </Field>
          <Field message={errFor("contactEmail")}>
            <label className={label}>
              Email <span className="text-red-600">*</span>
            </label>
            <input
              className={input}
              type="email"
              maxLength={INTAKE_LIMITS.shortText}
              value={fields.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
            />
          </Field>
          <Field message={errFor("contactPhone")}>
            <label className={label}>Phone</label>
            <input
              className={input}
              maxLength={40}
              value={fields.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
            />
          </Field>
          <Field message={errFor("city")}>
            <label className={label}>City</label>
            <input
              className={input}
              maxLength={INTAKE_LIMITS.shortText}
              value={fields.city}
              onChange={(e) => set("city", e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-4">
        <div className="text-xs uppercase tracking-wide text-stone-400">What you are proposing</div>
        <Field message={errFor("title")}>
          <label className={label}>
            Title <span className="text-red-600">*</span>
          </label>
          <input
            className={input}
            maxLength={INTAKE_LIMITS.shortText}
            value={fields.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field message={errFor("summary")}>
          <label className={label}>Summary</label>
          <textarea
            className={input}
            rows={6}
            maxLength={INTAKE_LIMITS.summary}
            value={fields.summary}
            onChange={(e) => set("summary", e.target.value)}
          />
          <p className="mt-1 text-xs text-stone-400">
            {fields.summary.length} / {INTAKE_LIMITS.summary}
          </p>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field message={errFor("requestedAmount")}>
            <label className={label}>Amount requested (₹)</label>
            <input
              className={input}
              inputMode="decimal"
              value={fields.requestedAmount}
              onChange={(e) => set("requestedAmount", e.target.value)}
            />
          </Field>
          <Field message={errFor("requestedMonths")}>
            <label className={label}>Over how many months?</label>
            <input
              className={input}
              inputMode="numeric"
              value={fields.requestedMonths}
              onChange={(e) => set("requestedMonths", e.target.value)}
            />
          </Field>
        </div>
        <Field message={errFor("domains")}>
          <label className={label}>Areas of work</label>
          <input
            className={input}
            placeholder="Comma separated"
            value={fields.domains.join(", ")}
            onChange={(e) =>
              set(
                "domains",
                e.target.value
                  .split(",")
                  .map((d) => d.trim())
                  .filter(Boolean)
                  .slice(0, INTAKE_LIMITS.domains),
              )
            }
          />
        </Field>
      </section>

      {questions.length > 0 && (
        <section className="rounded-lg border border-stone-200 bg-white p-4 space-y-4">
          <div className="text-xs uppercase tracking-wide text-stone-400">
            Questions for this call
          </div>
          {questions.map((q) => (
            <Field key={q.key} message={errFor(q.key)}>
              <label className={label}>
                {q.label}
                {q.required && <span className="text-red-600"> *</span>}
              </label>
              {q.type === "textarea" ? (
                <textarea
                  className={input}
                  rows={5}
                  maxLength={INTAKE_LIMITS.longText}
                  value={String(fields.answers[q.key] ?? "")}
                  onChange={(e) => setAnswer(q.key, e.target.value)}
                />
              ) : q.type === "select" ? (
                <select
                  className={input}
                  value={String(fields.answers[q.key] ?? "")}
                  onChange={(e) => setAnswer(q.key, e.target.value)}
                >
                  <option value="">Choose one</option>
                  {(q.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : q.type === "boolean" ? (
                <label className="flex items-center gap-2 text-sm text-stone-700">
                  <input
                    type="checkbox"
                    checked={fields.answers[q.key] === true}
                    onChange={(e) => setAnswer(q.key, e.target.checked)}
                  />
                  Yes
                </label>
              ) : (
                <input
                  className={input}
                  type={q.type === "date" ? "date" : "text"}
                  inputMode={q.type === "number" ? "decimal" : undefined}
                  maxLength={q.type === "text" ? INTAKE_LIMITS.shortText : undefined}
                  value={String(fields.answers[q.key] ?? "")}
                  onChange={(e) => setAnswer(q.key, e.target.value)}
                />
              )}
              {q.help && <p className="mt-1 text-xs text-stone-400">{q.help}</p>}
            </Field>
          ))}
        </section>
      )}

      {errors.length > 0 && !formError && (
        <p className="text-sm text-red-700">
          {errors.length === 1
            ? "One answer needs attention — see above."
            : `${errors.length} answers need attention — see above.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => go(false)}
          disabled={pending}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm text-stone-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : publicRef ? "Save" : "Save and come back later"}
        </button>
        <button
          onClick={() => go(true)}
          disabled={pending}
          className="rounded bg-stone-800 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Sending…" : "Submit the application"}
        </button>
        <p className="text-xs text-stone-400">
          Once submitted it cannot be edited here.
        </p>
      </div>
    </div>
  );
}
