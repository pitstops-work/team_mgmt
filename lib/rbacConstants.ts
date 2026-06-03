/**
 * Constants shared by server and client RBAC code. Kept in its own file so
 * `lib/rbacClient.ts` (client) and `lib/rbac.ts` (server) can both import
 * without dragging server-only dependencies across the boundary.
 */

export const SURFACE_HEADER = "x-surface";
