# Phase 1 RBAC Catalog

**Status:** Locked 2026-05-19. Ambiguities resolved by product owner.
**Source:** Derived from `docs/rbac-audit.md` plus the consolidation patches landed on 2026-05-19.

---

## Vocabulary

### Roles (`User.role`)

| Role          | Notes |
|---------------|-------|
| `super-admin` | Apex. Set in DB only (env-bootstrap on first sign-in). Can grant/revoke admin. |
| `admin`       | Org admin. Configures settings, templates, geography, etc. Can manage non-admin users. |
| `member`      | Standard contributor. Creates/edits goals/pitstops/activities. |
| `viewer`      | Read-only. All mutations 403 via `viewerForbidden` (now enforced on every mutating route). |
| `budget-admin` | Lives in separate `/budget` realm. Does not interact with the rest of the app. |

### Designations (`User.designation`) — *reporting hierarchy, independent of role*

Designations exist **solely to fix the reporting tree**. They are NOT permission elevations.
Scope for every designation = the user + their transitive reports (recursive). Higher in the tree means a wider team; nothing more.

| Designation | Position in tree | Practical team |
|-------------|------------------|----------------|
| `Leader` | Top (apex). Reports to nobody. | Self + all transitive reports below (often the whole org). |
| `PM`     | Above ZL.                       | Self + ZL reports + their RP reports. |
| `ZL`     | Above RP.                       | Self + direct RP reports. |
| `RP`     | Field worker.                   | Self only. |
| `Other`  | Below RP. Demo/test/disabled.  | Self only. Sees own-owned records and nothing else. |

### Scope rules

| Rule              | Semantics |
|-------------------|-----------|
| `all`             | No filter applied. Only `admin` and `super-admin` get this. |
| `self`            | `record.userId === me.id`. For resources keyed to the user themselves (notifications). |
| `own`             | `record.ownerId === me.id` OR `record.createdById === me.id`. |
| `team`            | Recursive team: me + all my (transitive) reports. RP=[me], ZL=[me, RPs], PM=[me, ZLs, RPs], Leader=[me, full subtree]. Other=[me]. |
| `city`            | `record.cityId === me.cityId` (or resolves via settlement→cluster→zone→city). |
| `zone`            | `record.zoneId IN me.leadZones`. |
| `cluster`         | `record.clusterId IN me.rpClusters`. |
| `subscribed`      | Thread/Notification subscription. |
| `geo_chain`       | The user's geo (city) reached via the resource's geography chain. |

---

## Resources × Actions × Scope (proposed)

Each cell = role → scope. `—` = forbidden. `all` = unrestricted. Multiple roles separated by `,`.

### 1. User

| Action | super-admin | admin | member | viewer | Notes |
|---|---|---|---|---|---|
| `list`    | all | all (non-admin only) | self | — | Admin list excludes admin/super-admin entries. |
| `read`    | all | all | self | self | |
| `create`  | all | non-admin only | — | — | Granting `admin` requires super-admin. |
| `update`  | all | non-admin only | self (name/password/lang/calendar) | self (lang only) | Admin can't promote to admin (super-admin gate). |
| `delete`  | all | non-admin only | — | — | Can't self-delete. |
| `reset_password` | all | non-super-admin targets | — | — | **LOCKED 2026-05-19:** admin can reset anyone except super-admin. Code patched. |
| `change_own_password` | self | self | self | — | |

### 2. Goal

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`    | all | all | team + city | team (recursive) + city | own | all (read) |
| `read`    | all | all | team (own+escalated+coowner+follower) | team (recursive) | own + follower | all (read) |
| `create`  | all | all | own | own | own | — |
| `update`  | all | all | own (owner only) | own | own | — |
| `delete`  | all | all | — | — | — | — |
| `change_owner` | all | all | own | own | own | — |

### 3. Pitstop

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`    | all | all | team | team (recursive) | own | all (read) |
| `read`    | all | all | team | team (recursive) | own | all (read) |
| `create`  | all | all | own (under goal) | own | own | — |
| `update`  | all | all | own (owner only) | own | own | — |
| `delete`  | all | all | — | — | — | — |
| `generate_partner_briefing` | all | all | — | — | — | — | Admin-only confirmed. |

### 4. PitstopEvent (Activity)

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`    | all | all | team (attendees) | team (recursive, attendees) | own (attendee) | all (read) |
| `create`  | all | all | own | own | own | — |
| `update`  | all | all | own (creator only) | own | own | — |
| `cancel`/`reschedule` | all | all | own (creator only) | own | own | — |
| `respond` (RSVP) | self | self | self | self | self | — | **LOCKED 2026-05-19:** separate from `update`. Attendee can change their own attendance status without `update` permission. |
| `delete`  | all | all | — | — | — | — |

### 5. Decision / Risk

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`    | all | all | own goal/pitstop | read-only |
| `create`  | all | all | own | — |
| `update`  | all | all | own (creator) | — |
| `delete`  | all | all | own (creator) | — |

### 6. Settlement / Cluster / Zone / City (Geography)

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`    | all | all | all (filtered by user.cityId for RP/ZL) | read-only |
| `read`    | all | all | all | read-only |
| `create`  | all | all | — | — |
| `update`  | all | all | — | — |
| `delete`  | all | all | — | — |
| `sync_civic_data` | all | — | — | — | *Currently super-admin only.* |

### 7. Programme (`Program`) — user-owned cross-goal grouping

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`    | all | all | own (city filter deferred — see note) | read-only |
| `create`  | all | all | own | — |
| `update`  | all | all | own (owner) | — |
| `delete`  | all | all | own (owner) | — |

**Open question (parked):** Does `Program` have a `cityId` field? If not, the "city" scope rule can't apply to it; Programs would be globally scoped or `own`-only. Phase 1 should check the schema and decide.

### 8. ProgrammeJourney (Layer 3) — settlement-scoped journey through phases

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`    | all | all | city | city (read-only) |
| `read`    | all | all | city | city |
| `create`  | all | all | — | — |
| `update`  | all | all | — | — |
| `delete`  | all | all | — | — |

**LOCKED 2026-05-19:** All journey mutations are admin-only. Members read within their city scope only.

### 9. Plan Item / Checklist Item

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`    | all | all | own pitstop/goal | read-only |
| `create`  | all | all | own | — |
| `update`  | all | all | own | — |
| `delete`  | all | all | own | — |

### 10. Thread / Message

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`    | all | all | team + subscribed | team (recursive) + subscribed | own + subscribed | all (read) |
| `read`    | all | all | team + subscribed | team (recursive) + subscribed | own + subscribed | all (read) |
| `post_message` | all | all | own thread | own thread | own thread | — |
| `subscribe` | all | all | self | self | self | self |
| `delete_thread` | all | all | — | — | — | — |

**Note:** Threads is the only context where `subscribed` is preserved for Other (because that's how users follow conversations they're tagged into). Goals/Pitstops/Activities use strict `own` for Other.

### 11. Notification

| Action | self | else |
|---|---|---|
| `list`/`read`/`mark_read` | self | — |

### 12. Map Notes / Map Partners / Layer Features

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all | all |
| `create`/`update`/`delete` | all | all | — | — |

*Patched today: previously some of these had no auth check at all.*

### 13. Needs Schemes / Formulas

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all | all |
| `update`/`delete` | all | all | — | — |

### 14. Templates / Facility Indicators / Facility Layers / Journey Outcome Packs / MIS Providers

All admin-only mutations; read by any authenticated user. (Already correctly gated by `/api/admin/*` route checks.)

### 15. App Settings / Invite Code

Admin-only; super-admin-only for rotating invite code.

### 16. Audit Log

| Action | super-admin | admin | else |
|---|---|---|---|
| `list`/`read` | all | own actions + entries about own user | — |
| `write` | (system only — via `auditLog()` helper) | | |

*Phase 1 deliverable: admin UI for the audit log. Slice TBD when we design that screen.*

### 17. Review Portal (separate `REVIEW_DATABASE_URL`)

All mutations gated to super-admin (now enforced). Read access to the portal layout is super-admin-only via redirect.

### 18. Budget

Separate realm. `budget-admin` + `super-admin` only. Don't mix into main RBAC catalog unless we collapse the realms later.

---

## Special actions (non-CRUD)

These don't fit the resource × action grid; they need their own permission keys.

| Action | Allowed by | Notes |
|---|---|---|
| `agent.use` | super-admin | The internal AI agent (chat). |
| `seed_data` | super-admin | One-off seed routes. |
| `geo.sync_civic` | super-admin | Civic data sync. |
| `partner_briefing.generate` | admin, super-admin | Admin-only confirmed. |
| `review_portal.access` | super-admin | Now audit-logged. |
| `password.reset_other` | admin, super-admin | Admin can reset any non-super-admin. Super-admin can reset super-admins. |
| `event.respond` (RSVP) | self | Separate from `event.update`. Attendee can RSVP without update perm. |

---

## Locked decisions (2026-05-19)

1. **Password reset** — Admin can reset passwords for everyone except super-admin. Only super-admin can reset a super-admin's password. *Code patched.*
2. **Leader designation** — Pure reporting-hierarchy marker, NOT a permission elevation. Leader gets team-recursive scope (which often equals "everyone below them in the tree"), nothing more. Where current code grants Leader "all" (most notably `/threads`), Phase 1 must replace with team-recursive scope.
3. **Other designation** — Last in the hierarchy. Demo/test/disabled credentials. Sees `own` only across all scoped resources (Goal, Pitstop, Activity, etc.). Threads is the one exception: `own + subscribed` (so they can follow conversations they're tagged into).
4. **ProgrammeJourney mutation** — Admin-only for all mutations. Members read within city only.
5. **`Program` city scope** — Parked. Phase 1 to check schema and decide.
6. **PitstopEvent RSVP** — Separate `event.respond` action. Attendee can change own attendance status without `update` permission.
7. **Notification mark-as-read for viewers** — Keep blocking. Current behavior is intentional.
8. **`Other` wildcard sweep** — See Phase 1 sweep checklist below.

---

## Phase 1 sweep checklist

These places currently rely on a wildcard `else` branch that produces incorrect scope for `Leader` and/or `Other`. Phase 1 must fix all of them when the central `scopeWhere()` API lands.

| File | Resource | Current bug | Target |
|---|---|---|---|
| `app/api/goals/route.ts` | Goal list | `isScoped` only true for RP/ZL/PM; Leader/Other fall through and see all (subject to city filter) | Leader → team-recursive; Other → own only |
| `app/(app)/home/page.tsx` | Goals/pitstops/activities team-fetch | Hardcoded ZL/PM branches; Leader/Other fall through to wildcard | Leader → team-recursive; Other → own only |
| `app/(app)/dashboard/page.tsx` | Goals/pitstops dashboard data | Same pattern as `home/page.tsx` | Same |
| `app/(app)/activities/page.tsx` | Activity list | `isScoped` only for RP/ZL/PM; Leader/Other unscoped | Leader → team-recursive; Other → own only |
| `app/(app)/home/HomeView.tsx` | Tab selection (`RP_TABS` / `ZL_TABS` / `PM_TABS` / `OTHER_TABS`) | Leader currently falls into `OTHER_TABS` (single "today" tab) | Decide what tabs Leader should see — possibly same as PM_TABS, or new LEADER_TABS |

**Recursion depth.** ZL = 1 level, PM = 2 levels, Leader = arbitrary (could be PM→ZL→RP). The current ad-hoc PM logic stops at 2 levels. Phase 1 should replace with a `WITH RECURSIVE` CTE on `reportsToId` so Leader (and any future deeper hierarchies) Just Work.

---

## Phase 1 implementation outline

Once this catalog is locked:

1. **Schema:** `Permission { id, resource, action }`, `Role { id, name }`, `RolePermission { roleId, permissionId, scopeRule (jsonb) }`, `UserRole { userId, roleId }` (if we go many-to-many; otherwise just keep `User.role`).
2. **Central API:**
   - `can(user, action, resource, target?) → boolean`
   - `scopeWhere(user, resource) → Prisma.WhereInput` for list endpoints.
3. **Seed:** Initial seed reproduces the matrix above so default behavior is preserved.
4. **Admin UI:** `/settings/users` gains a "Roles" tab → matrix editor with predicate-builder for scope rules.
5. **Migration:** route-by-route, feature-flagged. Each route's old hardcoded check stays until the new `can()`/`scopeWhere()` returns identical results on staging.

---

## Out of scope for Phase 1

- Per-field permissions (e.g., "RP can update Goal.title but not Goal.targetDate"). Defer to Phase 2 if needed.
- Time-bound permissions ("admin only during business hours").
- Approval workflows (multi-step grants).
