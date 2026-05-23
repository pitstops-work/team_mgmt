# Phase 1 RBAC Catalog

**Status:** Locked 2026-05-19. Refreshed 2026-05-22 — new resources (rows 19–38) added, Programme `cityId` question resolved, Leader tab decision locked, sweep checklist updated.
**Source:** Derived from `docs/rbac-audit.md` plus consolidation patches (2026-05-19) and the catalog-refresh audit (2026-05-22).

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
| `list`    | all | all | own | read-only |
| `create`  | all | all | own | — |
| `update`  | all | all | own (owner) | — |
| `delete`  | all | all | own (owner) | — |

**Resolved 2026-05-22:** `Program` has no `cityId` field. Scope is strictly `own` — no city filter applies.

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
*See also row 31 (`MapData`) for the broader read-only map endpoints — heatmaps, geojson layers, schools, health centres, cluster/zone summaries.*

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

# Catalog refresh — 2026-05-22

Resources added after the 2026-05-19 lock. All scopes below are locked decisions from the 2026-05-22 product-owner pass.

### 19. TeamMetrics — SLA, overdue, engagement panels

Drives Leader Today tab + `/sla` page. Backed by `/api/team-sla`, `/api/team-sla/drill`, `/api/team-overdue`, `/api/engagement/activity-feed`.

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`/`read` | all | all | team (recursive) | team (recursive) | own | all (read) |

**Notes:** Anyone with reports sees their team's metrics. RP/Other see self only (effectively empty for metrics that aggregate reports). `/sla` page is currently gated `isAdminUser` — needs migration to use this row's scope instead.

### 20. EffectsIndicator — Layer 1 outcomes

Backed by `/api/effects/indicators`, `/api/effects/needs-progress`, `/effects` page.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all | all |
| `create`/`update`/`delete` | all | all | — | — |

**Locked 2026-05-22:** All-authenticated read. Geo-filtering happens in UI, not at the catalog layer. Mutations admin-only.

### 21. ProgrammeJourney (Phase / Edge / Outcome / Attribution / Points) — Layer 3 internals

Backed by `/api/programmes/[id]/phases/*`, `/edges/*`, `/outcomes/*`, `/outcomes/[outcomeId]/{attribution,points}`, `/api/programmes/[id]/{close,reopen,children,super}`.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all (city-filtered in UI) | all (read) |
| `create`/`update`/`delete` | all | all | — | — |
| `apply_pack` | all | all | — | — |

**Locked 2026-05-22:** Member reads are NOT scoped by city at the catalog layer — the UI applies city filtering. (This supersedes catalog row 8's earlier `city` scope on the bare `ProgrammeJourney` resource; row 8 is retained for the journey list view, while row 21 covers the journey internals exposed via the programme detail UI.) All mutations admin-only.

### 22. JourneyOutcomePack — admin-curated outcome templates

Backed by `/api/admin/journey-outcome-packs/*`, `/api/programmes/[id]/apply-pack/[packId]`, `/settings/journey-outcome-packs` page.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all (when attached to a programme) | read-only |
| `create`/`update`/`delete`/`apply` | all | all | — | — |

### 23. Quarter

Master quarter list. Backed by `/api/quarters`, `/quarters` page.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all | all |
| `create`/`update`/`delete` | all | all | — | — |

### 24. Theme

Master theme list. Backed by `/api/themes`, `/themes` page.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all | all |
| `create`/`update`/`delete` | all | all | — | — |

### 25. Standup — daily/periodic standup entries

Backed by `/api/standup`, `/standup` page.

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`/`read` | all | all | team (recursive) | team (recursive) | own | all (read) |
| `create` | all | all | own | own | own | — |
| `update`/`delete` | all | all | own (creator) | own | own | — |

### 26. Retrospective

Backed by `/api/retrospectives`.

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`/`read` | all | all | team (recursive) | team (recursive) | own | all (read) |
| `create` | all | all | own | own | own | — |
| `update`/`delete` | all | all | own (creator) | own | own | — |

### 27. PlanItem — user-owned planner item

Distinct from `ChecklistItem` (row 9). `PlanItem.userId` is the owner; optional pitstop links via `PlanItemPitstop`. Backed by `/api/plan-items/*`, `/api/planner-data`, `/planner` page.

| Action | super-admin | admin | RP/ZL/PM | Leader | Other | viewer |
|---|---|---|---|---|---|---|
| `list`/`read` | all | all | team (recursive) | team (recursive) | own | all (read) |
| `create` | all | all | own | own | own | — |
| `update`/`delete` | all | all | own (creator) | own | own | — |

### 28. ChecklistItem — pitstop-scoped checklist (clarifies row 9)

Row 9 ("Plan Item / Checklist Item") is now split. `ChecklistItem.pitstopId` is the parent; scope inherits from the parent Pitstop. Backed by `/api/checklist/[itemId]/*`, `/api/checklist/reorder`, `/api/pitstops/[pitstopId]/checklist`.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read`/`create`/`update`/`delete` | all | all | inherits Pitstop scope | read-only |

### 29. Needs (Assessment / Scheme / Formula / Actuals / Gap / ProgressChecklist)

Backed by `/api/needs/*`. Page: `/needs`, `/needs/settlement/[id]`.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all (geo-filtered in UI) | all (read) |
| `create`/`update`/`delete` | all | all | — | — |

### 30. MapData (read-only feeds beyond row 12)

Catalog umbrella for the broader read-only map endpoints. Backed by `/api/map/cluster-activities`, `/cluster-needs`, `/cluster-pitstops`, `/geo-goals`, `/geojson/{clusters,zones,settlements,layer-features}`, `/health-centres`, `/health-clusters`, `/needs-heatmap`, `/progress-health`, `/my-goal-scope`, `/schools`, `/settlement-needs`, `/zone-needs`, `/api/clusters/summary`, `/api/zones/summary`, `/api/geography/*`.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `list`/`read` | all | all | all | all (read) |
| `register_settlement` (`/api/map/register-settlement`) | all | all | — | — |
| `retag_schools` (`/api/map/schools/retag`) | all | all | — | — |

Row 12 still owns Map Notes / Map Partners / Layer Features mutations specifically.

### 31. Calendar — user's own calendar

Backed by `/api/calendar/feed.ics`, `/api/calendar/external`, `/api/account/external-calendar`.

| Action | self | else |
|---|---|---|
| `read`/`subscribe` | self | — |

### 32. Attachment / File / Audio / Upload

Backed by `/api/attachments/*`, `/api/attachment/[id]`, `/api/files/[...filename]`, `/api/upload`, `/api/audio`.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `read` (via tokenised URL) | all | all | linked-record scope | linked-record scope |
| `create` (upload) | all | all | any authenticated | — |
| `delete` | all | all | own (uploader) | — |

**Note:** `linked-record scope` = the attachment is readable iff the user can read the record it's attached to (pitstop, goal, thread message, etc.). Enforced at fetch time.

### 33. Search

Backed by `/api/search`.

| Action | super-admin | admin | member | viewer |
|---|---|---|---|---|
| `execute` | all | all | all (results filtered through resource scopes) | all (read-only results) |

### 34. Cron (system)

Backed by `/api/cron/*` — `activity-followup`, `activity-morning-nudge`, `checkin-reminder`, `checkins`, `reminders`, `sync-chennai-demographics`, `sync-entitlements`, `sync-entitlements-chennai`, `sync-entitlements-survey`, `weekly-plan-nudge`.

| Action | who |
|---|---|
| `execute` | system only (verified via `CRON_SECRET`; no user session) |

### 35. AI Agent (chat assistant)

Backed by `/api/agent`, `/api/ai`.

| Action | super-admin | else |
|---|---|---|
| `agent.use` | super-admin | — |

Already represented under "Special actions" but lifted here for visibility.

### 36. Settings (`/settings/*` pages)

| Page | who |
|---|---|
| `/settings/users` | admin + super-admin |
| `/settings/roles`, `/settings/roles/[roleId]` | super-admin only |
| `/settings/geography`, `/settings/templates`, `/settings/facility-indicators`, `/settings/facility-layers`, `/settings/map-features`, `/settings/journey-outcome-packs`, `/settings/mis-providers`, `/settings/needs` | admin + super-admin |
| `/settings/language` | self (any authenticated) |
| `/settings` (landing) | any authenticated (renders the subset of cards their role allows) |

### 37. Admin sub-routes not previously enumerated

Backed by `/api/admin/chennai-geo`, `/api/admin/seed-shwetha`, `/api/admin/template-checklist-keys`, `/api/admin/sync-civic`, `/api/admin/settings`.

| Action | who |
|---|---|
| All CRUD | admin + super-admin (seed-shwetha and sync-civic: super-admin only) |

### 38. Tabs — designation-driven navigation (`AppNav.tsx` + `HomeView.tsx`)

**Locked 2026-05-22:** Leader uses **PM_TABS** (same set as PM). Today, This Week, Team SLA, Engagement, Past Load. This resolves the catalog sweep item "decide LEADER_TABS." Other continues to fall into single-Today.

Pages reachable from nav that do NOT have their own auth gate beyond session:
- `/people`, `/partners`, `/readiness`, `/report`, `/route`, `/timeline`, `/portal` — all authenticated, content scoped via the resources they read.

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
| `programme.apply_pack` | admin, super-admin | Applies a JourneyOutcomePack to a programme. (Added 2026-05-22.) |
| `cron.execute` | system (CRON_SECRET) | All `/api/cron/*` routes. No user session. (Added 2026-05-22.) |
| `search.execute` | any authenticated | Results filtered through per-resource scopes downstream. (Added 2026-05-22.) |
| `team.view_metrics` | any user with reports + admin | SLA, overdue, engagement panels. RP/Other see self only (effectively empty). (Added 2026-05-22.) |

---

## Locked decisions (2026-05-19)

1. **Password reset** — Admin can reset passwords for everyone except super-admin. Only super-admin can reset a super-admin's password. *Code patched.*
2. **Leader designation** — Pure reporting-hierarchy marker, NOT a permission elevation. Leader gets team-recursive scope (which often equals "everyone below them in the tree"), nothing more. Where current code grants Leader "all" (most notably `/threads`), Phase 1 must replace with team-recursive scope.
3. **Other designation** — Last in the hierarchy. Demo/test/disabled credentials. Sees `own` only across all scoped resources (Goal, Pitstop, Activity, etc.). Threads is the one exception: `own + subscribed` (so they can follow conversations they're tagged into).
4. **ProgrammeJourney mutation** — Admin-only for all mutations. Members read within city only.
5. **`Program` city scope** — Parked. Phase 1 to check schema and decide. → *Resolved 2026-05-22: no `cityId` field exists; scope is strictly `own`.*
6. **PitstopEvent RSVP** — Separate `event.respond` action. Attendee can change own attendance status without `update` permission.
7. **Notification mark-as-read for viewers** — Keep blocking. Current behavior is intentional.
8. **`Other` wildcard sweep** — See Phase 1 sweep checklist below.

---

## Locked decisions (2026-05-22)

1. **TeamMetrics scope** — Anyone with reports sees their team's SLA/overdue/engagement panels (`team` recursive). RP/Other see self only. Admin sees all.
2. **ProgrammeJourney member reads** — All-authenticated read; UI applies city filtering. Catalog does NOT enforce city scope on programme internals. Mutations remain admin-only.
3. **Effects/Indicators** — All-authenticated read. Mutations admin-only.
4. **Quarter / Theme** — Master lists; all-authenticated read, admin mutate.
5. **Standup / Retrospective** — `team` scope for read (recursive). Entries are own-only on write/update/delete.
6. **PlanItem vs ChecklistItem** — Distinct resources. PlanItem is user-owned (planner). ChecklistItem inherits scope from parent Pitstop. Row 9 "Plan Item / Checklist Item" is now split into rows 27 and 28.
7. **LEADER_TABS** — Leader uses the same tab set as PM (`PM_TABS`). Resolves the `HomeView.tsx` sweep item.
8. **Calendar** — Self-only across all calendar endpoints (ICS feed, external sync).
9. **Attachments** — Read inherits the linked-record scope (you can read the attachment iff you can read its parent). Upload = any authenticated. Delete = own + admin.
10. **Cron** — All `/api/cron/*` are system-only via `CRON_SECRET`. No user session is ever consulted.
11. **`Program` cityId** — Resolved (no `cityId` field). Scope: `own`.

---

## Phase 1 sweep checklist

These places currently rely on a wildcard `else` branch that produces incorrect scope for `Leader` and/or `Other`. Phase 1 must fix all of them when the central `scopeWhere()` API lands.

| File | Resource | Current state | Target |
|---|---|---|---|
| `app/api/goals/route.ts` | Goal list | **RBAC live** (2026-05-23). Legacy branch deleted; `USE_RBAC` gate removed. | Done. |
| `app/(app)/home/page.tsx` | Goals/pitstops/activities team-fetch | **RBAC live** (2026-05-23). Legacy branch deleted. | Done. |
| `app/(app)/dashboard/page.tsx` | Goals/pitstops dashboard data | **RBAC live** (2026-05-23). Legacy branch deleted. User-list, workload-detail, audit-feed queries still consume `isScoped + teamIds` derived from RBAC, but lack dedicated `user` / `audit_log` scope builders. | Add `user` + `audit_log` scope builders in `lib/rbac.ts`; migrate remaining ~5 query spots. |
| `app/(app)/activities/page.tsx` | Activity list | **RBAC live** (2026-05-23). Legacy branch deleted. | Done. |
| `app/(app)/threads/page.tsx` | Thread list | **RBAC live** (2026-05-23). Legacy branch deleted. | Done. |
| `app/(app)/home/HomeView.tsx` | Tab selection | LEADER_TABS decision: **same as PM_TABS** (locked 2026-05-22). Code still maps Leader → OTHER_TABS. | Add Leader to PM_TABS branch in HomeView. |
| `app/(app)/AppNav.tsx` | Tab visibility by designation | Hardcoded designation checks. | Refactor to use RBAC context (tabs resource); Leader = PM tab set. |
| `app/api/programmes/route.ts` | Programme list (raw SQL) | Has its own city scoping. Not under RBAC. | Add SQL-friendly scope helper, then join the RBAC system. |
| `app/api/team-sla/*`, `/api/team-overdue`, `/api/engagement/activity-feed` | TeamMetrics (row 19) | Session-only check; no RBAC scope. | Apply `team` recursive scope through `scopeWhere(user, "team_metrics")`. |
| `/sla` page | TeamMetrics visibility | Gated `isAdminUser` — too restrictive vs new policy. | Replace with `can(user, "team_metrics", "read")`; allow ZL/PM/Leader to see their team. |
| `/effects` page | EffectsIndicator (row 20) | Session-only. | Confirm all-authenticated read is correct (matches catalog) — no migration needed beyond stating it. |
| `app/api/standup/route.ts` | Standup (row 25) | Session-only. | `team` scope read, `own` write. |
| `app/api/retrospectives/route.ts` | Retrospective (row 26) | Session-only. | Same. |
| `app/api/plan-items/*` + `/api/planner-data` | PlanItem (row 27) | Session-only; legacy team logic. | `team` scope read, `own` write. |
| `app/api/programmes/[id]/phases/*`, `/edges/*`, `/outcomes/*` | ProgrammeJourney internals (row 21) | `isAdminUser` for mutations; mostly session-only for reads. | Confirm reads are all-authenticated (matches catalog); admin-only mutations stays as-is. |
| `app/api/admin/journey-outcome-packs/*`, `/api/programmes/[id]/apply-pack/*` | JourneyOutcomePack (row 22) | `isAdminUser`. | Matches catalog; document under `programme.apply_pack` special action. |
| `app/api/cron/*` | Cron (row 34) | Mixed: some routes check `CRON_SECRET`, some don't. | Audit each; enforce `CRON_SECRET` uniformly. |
| Audit log admin UI | AuditLog (row 16) | Listed in catalog as Phase 1 deliverable; **never built**. | Build `/settings/audit` page (admin-only); back with scoped `/api/audit` reads. |

**Recursion depth.** ZL = 1 level, PM = 2 levels, Leader = arbitrary (could be PM→ZL→RP). `lib/rbac.ts` already uses a `WITH RECURSIVE` CTE on `reportsToId` (added 2026-05-19) so Leader and any future deeper hierarchies Just Work.

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
