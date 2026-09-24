/**
 * Thin fetch wrapper used by client-side mutations.
 *
 * Auto-injects:
 *   - `X-Surface` header from the current `<SurfaceProvider>` context, so
 *     surface-restricted RBAC grants can be enforced on the server.
 *   - `Content-Type: application/json` when sending a JSON body (caller can
 *     override).
 *
 * Returns parsed JSON. Throws on non-2xx with `{ status, body }` attached so
 * callers can branch on 403 (surface or RBAC denial), 404, etc.
 *
 * Usage:
 *   await fetchJson(`/api/pitstop-events/${id}`, { method: "PATCH", json: { done: true } });
 */

import { getCurrentSurface, SURFACE_HEADER } from "./rbacClient";

export class FetchJsonError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
    this.name = "FetchJsonError";
  }
}

export type FetchJsonInit = Omit<RequestInit, "body"> & {
  /** Object to JSON-stringify into the body. Sets Content-Type automatically. */
  json?: unknown;
  /** Raw body — used if `json` is not set. */
  body?: BodyInit | null;
};

/**
 * Turn a failed request into a line a field user can act on. Surface-restricted
 * grants fail with a bare 403, which is otherwise indistinguishable from a dead
 * button — always render this rather than swallowing the error.
 */
export function describeFetchError(e: unknown, fallback: string): string {
  if (e instanceof FetchJsonError) {
    if (e.status === 403) return "You don't have permission to do that here. Ask an admin to check your access, then try again.";
    if (e.status === 401) return "You've been signed out. Reload the page and sign in, then try again.";
    return `${fallback} (${e.status}${e.message ? ` — ${e.message}` : ""})`;
  }
  return `${fallback} Check your network connection.`;
}

export async function fetchJson<T = unknown>(input: string, init: FetchJsonInit = {}): Promise<T> {
  const { json, headers: rawHeaders, ...rest } = init;
  const headers = new Headers(rawHeaders);

  if (json !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const surface = getCurrentSurface();
  if (surface && !headers.has(SURFACE_HEADER)) {
    headers.set(SURFACE_HEADER, surface);
  }

  const res = await fetch(input, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : init.body ?? null,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const parsed: unknown = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string"
        ? parsed.error
        : `Request failed: ${res.status}`);
    throw new FetchJsonError(res.status, message, parsed);
  }

  return parsed as T;
}
