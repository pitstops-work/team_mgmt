"use client";

/**
 * Client-side RBAC providers + hooks.
 *
 *   <GrantsProvider grants={…}>     — set once in app/(app)/layout.tsx (server
 *                                     component fetches the user's grants and
 *                                     hands them down).
 *   <SurfaceProvider id="home.today">…</SurfaceProvider>
 *                                   — wraps a page/tab/sheet. Most recently
 *                                     mounted surface is "current" for both
 *                                     `useCan()` and `fetchJson()`.
 *   useCan(resource, action)        — boolean; mirrors server `can()` semantics
 *                                     including surface allowlist.
 */

import { createContext, useContext, useEffect, useMemo } from "react";
import { hasGrant, pushSurface, type UserGrant } from "@/lib/rbacClient";

// ── Grants ───────────────────────────────────────────────────────────────────

const GrantsContext = createContext<ReadonlyArray<UserGrant>>([]);

export function GrantsProvider({
  grants,
  children,
}: {
  grants: ReadonlyArray<UserGrant>;
  children: React.ReactNode;
}) {
  return <GrantsContext.Provider value={grants}>{children}</GrantsContext.Provider>;
}

export function useGrants(): ReadonlyArray<UserGrant> {
  return useContext(GrantsContext);
}

// ── Surface ──────────────────────────────────────────────────────────────────

const SurfaceContext = createContext<string | null>(null);

export function SurfaceProvider({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  useEffect(() => pushSurface(id), [id]);
  return <SurfaceContext.Provider value={id}>{children}</SurfaceContext.Provider>;
}

/** Returns the current surface id from the React tree (deepest provider). */
export function useSurface(): string | null {
  return useContext(SurfaceContext);
}

// ── useCan ───────────────────────────────────────────────────────────────────

export function useCan(resource: string, action: string): boolean {
  const grants = useGrants();
  const surface = useSurface();
  return useMemo(
    () => hasGrant(grants, resource, action, surface),
    [grants, resource, action, surface],
  );
}

/**
 * Surface-agnostic permission check — true if the user has the grant at all,
 * regardless of which surface they're currently on. Use this for navigation
 * visibility (e.g. settings index links) where you want to show the link as
 * long as the user can do the action *somewhere*, even if the action itself
 * is restricted to specific surfaces.
 */
export function useHasGrant(resource: string, action: string): boolean {
  const grants = useGrants();
  return useMemo(
    () => grants.some((g) => g.resource === resource && g.action === action),
    [grants, resource, action],
  );
}
