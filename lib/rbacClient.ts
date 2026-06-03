/**
 * Client-side RBAC shared bits — types + the current-surface registry that
 * both `<SurfaceProvider>` and `fetchJson()` read from.
 *
 * The current surface is tracked as an ordered Set of provider-scoped tokens
 * (each `<SurfaceProvider>` mounts a unique token). The most recently mounted
 * surface wins — so opening a side panel (`pitstop.panel`) over a page
 * (`home.today`) makes the panel the "current" surface; closing the panel
 * restores the page.
 *
 * Server semantics live in lib/rbac.ts. This module is client-safe and has no
 * server-only imports.
 */

import { SURFACE_HEADER } from "./rbacConstants";

export type GrantRule = {
  kind: string;
  surfaces?: string[];
};

export type UserGrant = {
  resource: string;
  action: string;
  scopeRule: GrantRule;
};

// ── Current surface registry ─────────────────────────────────────────────────

type SurfaceToken = { id: string };

const ACTIVE_SURFACES = new Set<SurfaceToken>();

/** Returns the most recently mounted surface's id (or null if none). */
export function getCurrentSurface(): string | null {
  let last: string | null = null;
  for (const tok of ACTIVE_SURFACES) last = tok.id;
  return last;
}

/**
 * Registers a surface. Returns the disposer to call on unmount.
 * `<SurfaceProvider>` uses this in a useEffect.
 */
export function pushSurface(id: string): () => void {
  const token: SurfaceToken = { id };
  ACTIVE_SURFACES.add(token);
  return () => {
    ACTIVE_SURFACES.delete(token);
  };
}

export { SURFACE_HEADER };

// ── Permission check (mirrors server `can()` exactly) ────────────────────────

export function hasGrant(
  grants: ReadonlyArray<UserGrant> | null | undefined,
  resource: string,
  action: string,
  surface: string | null,
): boolean {
  if (!grants) return false;
  const match = grants.find((g) => g.resource === resource && g.action === action);
  if (!match) return false;
  const allowed = match.scopeRule.surfaces;
  if (!allowed || allowed.length === 0) return true;
  if (!surface) return false;
  return allowed.includes(surface);
}
