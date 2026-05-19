# RBAC Audit — Phase 0

**Audit Date:** 2026-05-19  
**Scope:** Next.js 16 (App Router) + Prisma + PostgreSQL field-ops application  
**Framework:** NextAuth (JWT strategy) + Prisma Client  

---

## Roles in Use

### System Roles (User.role)
All defined in the database with string values, no enum in schema (comment indicates options).

| Role | Canonical Value | Where Set | Default | Notes |
|------|-----------------|-----------|---------|-------|
| **Super Admin** | `"super-admin"` | DB or env email stamp | N/A | Only user with `ADMIN_EMAIL` env var; can grant/revoke admin roles |
| **Admin** | `"admin"` | DB (user management UI) | N/A | Can CRUD configs, settings, templates, users (non-admin) |
| **Member** | `"member"` | DB or new Google sign-in | Default | Standard contributor; can create/edit goals, pitstops, activities |
| **Viewer** | `"viewer"` | DB or new Google sign-in | Viewer | Read-only; cannot create/edit/delete anything |
| **Budget Admin** | `"budget-admin"` | DB (manual assignment) | N/A | Can access `/budget` realm; handles budget reports & reallocation |

**Source:** `/lib/auth.ts` (L19–122), `/app/api/admin/users/[id]/route.ts` (L5, VALID_ROLES), `/app/(app)/settings/users/page.tsx` (L25, ROLES const)

### User Designations (User.designation)
Field-ops hierarchical roles; often combined with system role for feature gating.

| Designation | Canonical Value | Hierarchy | Notes |
|-------------|-----------------|-----------|-------|
| **Research Partner** | `"RP"` | Bottom (field worker) | Owns clusters, reports to ZL/PM; sees own data only by default |
| **Zonal Lead** | `"ZL"` | Middle (zone manager) | Leads zone(s), supervises RPs, reports to PM/Leader |
| **Programme Manager** | `"PM"` | Upper (programme) | Supervises ZLs + their RPs; cross-zone visibility |
| **Leader** | `"Leader"` | Top (director) | Organization leadership; full visibility |
| **Other** | `"Other"` | N/A | Default; no scoping (treats as admin context user) |

**Source:** Prisma schema (L18: `@default("Other")`), `/app/(app)/settings/users/page.tsx` (L28, DESIGNATIONS), `/app/api/admin/users/route.ts` (L68, VALID_DESIGNATIONS)

### Designation Hierarchy for Reporting (reportsToId)
Maps designation to allowed "reports to" designations:

```typescript
// /app/(app)/settings/users/page.tsx L48–52
RP:  ["ZL", "PM", "Leader"]       // RP can report to ZL, PM, or Leader
ZL:  ["PM", "Leader"]              // ZL can report to PM or Leader
PM:  ["PM", "Leader"]              // PM can report to PM (peer) or Leader
Leader: (no constraint shown)
Other: (no constraint shown)
```

---

## User Fields Used in Scoping

| Field | Type | Usage Pattern | Source File(s) |
|-------|------|---------------|-----------------|
| **userId** (current user) | String | Filter rows owned by/assigned to current user | Many (common) |
| **ownerId** | FK(User) | Pitstop/Goal/Decision owner; scoped to `user.id` for RP/ZL/PM | `/app/(app)/home/page.tsx`, `/app/(app)/activities/page.tsx` |
| **reportsToId** | FK(User) | Hierarchical chain: user.reportsToId → find team members | `/app/(app)/home/page.tsx` L1107–1121, `/app/(app)/activities/page.tsx` L19–30 |
| **designation** | String | Gating condition for visibility of tabs, routes, UI sections | 250+ uses across app |
| **cityId** | FK(City) \| null | User's assigned city; no major scoping rule found yet | Schema only; `/app/api/admin/users/[id]/route.ts` L18 (can set) |
| **rpClusters** | M2M(Cluster) | RP's assigned clusters (from Cluster.rps relation) | `/app/api/admin/users/[id]/route.ts` L74–79 (can set) |
| **leadZones** | M2M(Zone) | ZL's assigned zones (from Zone.leadId relation) | `/app/api/admin/users/[id]/route.ts` L66–71 (can set) |

---

## Resources × Actions × Roles (Matrix)

### User (self + admin management)

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **Read** own profile | all | `user.id === session.user.id` | `/app/(app)/layout.tsx` L18 |
| **Read** all users (member list) | super-admin, admin | All users | `/app/(app)/settings/page.tsx` L109 |
| **Create** user | super-admin (only) | — | `/app/(app)/settings/users/page.tsx` L115–160 + `/app/api/admin/users/route.ts` L71–84 |
| **Edit** user (name, email, role, designation, geo, reportsTo) | super-admin (role/admin only); admin (non-admin only) | Admins can edit members; super-admin required for admin/super-admin role changes | `/app/api/admin/users/[id]/route.ts` L8–39, L101 |
| **Delete** user | super-admin, admin | Prevent self-delete; super-admin required for admin/super-admin deletion | `/app/api/admin/users/[id]/route.ts` L84–107 |
| **Change own password** | all (except viewer discouraged) | — | `/app/(app)/settings/page.tsx` L145–180 |
| **Reset password** (another user) | super-admin, admin | — | `/app/(app)/settings/users/page.tsx` (UI) + `/app/api/admin/users/[id]/reset-password/route.ts` |

**Authorization Check Source:** `/lib/roleGuard.ts` (isAdminUser, isSuperAdmin); `/lib/roles.ts` (deprecated; keep for reference)

### Goal

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **List** goals | all authenticated | RP/ZL/PM see only team's goals (ownerId filter); Leader/admin see all | `/app/api/goals/route.ts` L16–24 |
| **Create** goal | member, admin, super-admin | — | `/app/(app)/dashboard/page.tsx` (UI) |
| **Read** goal detail | all (if accessible) | Goal owner + escalations + coOwners + followers | `/app/(app)/goals/[goalId]/page.tsx` |
| **Edit** goal (title, status, dates, coOwners) | admin, super-admin, goal.ownerId | Admin can edit any; owner can edit own | `/app/(app)/goals/[goalId]/GoalDetail.tsx` L1003–1046 |
| **Delete** goal | admin, super-admin | Admin-only; shown in UI | `/app/(app)/goals/[goalId]/GoalDetail.tsx` |

**Team Scope:** RP = `[userId]`; ZL = `[userId, ...team.map(m => m.id)]` where team = users with `reportsToId === userId`; PM = ZLs + their RPs.

**Source:** `/app/api/goals/route.ts` L1–40, `/app/(app)/home/page.tsx` L1080–1180 (team calculation)

### Pitstop

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **List** pitstops | all | RP sees own (`ownerId`), ZL sees team, PM sees team (recursive), others see all (none filtered) | `/app/(app)/home/page.tsx`, `/app/(app)/activities/page.tsx` (same pattern as goals) |
| **Create** pitstop | member, admin, super-admin | Under a goal; owner = creator | `/app/(app)/goals/[goalId]/pitstops/[pitstopId]/PitstopDetail.tsx` |
| **Edit** pitstop | pitstop owner, admin, super-admin | Owner or admin | `/app/(app)/goals/[goalId]/pitstops/[pitstopId]/PitstopDetail.tsx` L1246–1348 |
| **Delete** pitstop | admin, super-admin | Admin-only | |
| **Generate partner briefing** | super-admin, admin only | Settlements via MapPartner FK; not user-scoped | `/app/api/pitstops/[pitstopId]/partner-briefing/route.ts` L22 |

### PitstopEvent (Activity)

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **List** activities | all | RP sees own attendees, ZL/PM see team attendees (recursive), others see all | `/app/(app)/activities/page.tsx` L18–40 |
| **Create** activity | member, admin, super-admin | Under pitstop(s); creator = createdBy | `/app/(app)/activities/page.tsx` (EventsCalendar component) |
| **Edit** activity (date, status, attendees, reason) | creator, admin, super-admin | Creator or admin | `/app/(app)/activities/page.tsx` |
| **Cancel/Reschedule** activity | creator, admin, super-admin | Requires reason field | Same as edit |

### Settlement / Geography

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **List** zones | all | ZL/PM see only assigned zones (Zone.leadId); others see all | `/app/(app)/needs/page.tsx`, `/app/(app)/settings/users/page.tsx` |
| **List** clusters | all | RP sees assigned clusters (Cluster.rps FK); others see all | `/app/(app)/settings/users/page.tsx` (L62, clusters) |
| **Edit** zone/cluster/settlement metadata | admin, super-admin | Admin-only | `/app/(app)/settings/geography/page.tsx` |
| **Sync civic data** | super-admin only | — | `/app/api/admin/sync-civic/route.ts` L91 |

### Configuration (Settings/Admin)

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **Settings → Users** | super-admin (view), admin (view non-admin) | Read all users; edit non-admin (admin-gated) | `/app/(app)/settings/users/page.tsx` L55–57, L108 |
| **Settings → Templates** | admin, super-admin | Read all; create/edit/delete admin-only | `/app/(app)/settings/templates/page.tsx` L31–34 |
| **Settings → Facility Indicators** | admin, super-admin | Admin-only | `/app/(app)/settings/facility-indicators/page.tsx` L108–119 |
| **Settings → Facility Layers** | admin, super-admin | Admin-only | `/app/(app)/settings/facility-layers/page.tsx` L57–60 |
| **Settings → Journey Outcome Packs** | admin, super-admin | Admin-only | `/app/(app)/settings/journey-outcome-packs/page.tsx` L52–55 |
| **Settings → MIS Providers** | admin, super-admin | Admin-only | `/app/(app)/settings/mis-providers/page.tsx` L71–76 |
| **Settings → Invite Code** | admin, super-admin | Read/rotate code; admin-only | `/app/(app)/settings/page.tsx` L106–143 |
| **Settings → External Calendar URL** | not viewer | Self-edit; viewer cannot set | `/app/(app)/settings/page.tsx` L99–105, L195 |
| **Settings → Preferred Language** | all | Self-edit | `/app/(app)/settings/page.tsx` L115–127 |
| **Settings → Notifications** | all | Self-opt-in | `/app/(app)/settings/page.tsx` L59–91 |

### Budget

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **View** budget dashboard | budget-admin, super-admin | — | `/app/(budget)/admin/budgets/page.tsx` L9 (redirect if not authorized) |
| **Create/Edit** budget | budget-admin, super-admin | Budget.partnerId = creator.id; only partner or super-admin can edit | `/app/(budget)/budget/report-actions.ts` L23, L70 |
| **View** budget report | budget-admin, super-admin | — | `/app/(budget)/budget/page.tsx` |
| **Generate** report slots / reallocation requests | budget-admin, super-admin | — | `/app/(budget)/budget/report-actions.ts` L207–399 |

### Review Portal

| Action | Roles | Scope Rule | File:Line |
|--------|-------|-----------|-----------|
| **Access** `/portal/*` routes | super-admin only | Redirect if not super-admin | `/app/(review-portal)/layout.tsx` L15 |

---

## Data-Scoping Rules by Route

### `/api/goals` (GET — list goals)

**Route:** `GET /api/goals`  
**Roles:** All authenticated (member, admin, super-admin, viewer, budget-admin)  
**Scope Logic:**
```
if (designation === "ZL") {
  teams = [userId, ...direct reports]
  filter: ownerId in teams
} else if (designation === "PM") {
  teams = [userId, ...ZL reports, ...RP reports of those ZLs]
  filter: ownerId in teams
} else {
  // RP or Other: no filtering (assumes self or admin context)
}
```
**Where Clause:** `/app/api/goals/route.ts` L16–24  
**Select:** goals with owner, pitstops, coOwners, etc.

### `/api/home-data` (GET — dashboard data)

**Route:** `GET /api/home-data`  
**Roles:** All authenticated  
**Scope Logic:** Same hierarchical team building + filtering of goals/pitstops/activities by team.  
**File:** `/app/(app)/home/page.tsx` L1080–1180 (server-side data fetch)

### `/api/activities/[EventsCalendar]` (GET/POST activities)

**Route:** `GET /app/(app)/activities` (client-rendered, fetches PitstopEvent)  
**Scope:** RP sees own attendees; ZL/PM see team attendees; others see all.  
**Filter:**
```
if (isScoped) {
  attendees: { some: { userId: { in: teamIds } } }
} else {
  {} // no filter
```
**File:** `/app/(app)/activities/page.tsx` L18–40

### `/api/admin/users` (GET/POST/PATCH user management)

**Route:** `GET /api/users` → list all users (admin-only)  
**Authorization:** `/lib/roleGuard.ts` isAdminUser(session) check  
**Route:** `POST /api/admin/users` → create user  
**Authorization:** isAdminUser; if role === "admin", must be super-admin  
**Route:** `PATCH /api/admin/users/[id]` → edit user  
**Authorization:** isAdminUser  
**Role Protection:** Super-admin required to change admin/super-admin roles  
**File:** `/app/api/admin/users/route.ts` L1–87, `/app/api/admin/users/[id]/route.ts` L1–107

---

## UI Section Visibility (Component-Level Role Gates)

### Settings Page (`/app/(app)/settings/page.tsx`)

| Section | Visible To | File:Line |
|---------|-----------|-----------|
| External Calendar URL input | not viewer | L99–105, L195 |
| Invite Code (view/rotate) | admin, super-admin | L106–109, L323–370 |
| Member list | admin, super-admin | L109 |
| Language picker | all | L42–49, L115–127 |
| Password change | all | L145–180 |
| Notifications setup | all | L59–91, L218–322 |

**Authorization Checks:**
```typescript
const isAdmin = role === "admin" || role === "super-admin" || email === NEXT_PUBLIC_ADMIN_EMAIL
const isViewer = role === "viewer"
if (!isViewer) { fetch calendar... }
if (isAdmin) { fetch invite code, users... }
```

### Settings → Users (`/app/(app)/settings/users/page.tsx`)

| Element | Visible To | File:Line |
|---------|-----------|-----------|
| User list table | super-admin (all), admin (non-admin only) | L98–300 |
| Create user form | super-admin, admin | L180–292 |
| Designation badge | all (display) | L293–296 |
| Role selector | super-admin only (can grant admin) | L149–151 |
| Zone assignment (ZL/PM) | UI shows if editDesignation is ZL/PM | L158–170 |
| Cluster assignment (RP) | UI shows if editDesignation is RP | L171–180 |
| Reports To dropdown | Filtered by REPORTS_TO_FILTER hierarchy | L48–52, L158–170 |
| Reset password button | super-admin, admin | L81–97 |

### Home Page Tabs (`/app/(app)/home/HomeView.tsx`)

**Tab Configuration:**
```typescript
const RP_TABS = ["today", "coverage"]
const ZL_TABS = ["today", "health", "coverage", "clusters"]
const PM_TABS = ["today", "zl-health", "rp-health", "coverage", "clusters"]
const ADMIN_TABS = ["today", "goals", "coverage", "teams", "phase"]
const OTHER_TABS = ["today"]

const tabs = isAdmin ? ADMIN_TABS 
  : designation === "ZL" ? ZL_TABS 
  : designation === "RP" ? RP_TABS 
  : designation === "PM" ? PM_TABS 
  : OTHER_TABS
```
**File:** `/app/(app)/home/HomeView.tsx` L4751–4839

| Tab | RP | ZL | PM | Leader | Admin |
|-----|----|----|----|---------|----|
| today | ✓ | ✓ | ✓ | ✓ | ✓ |
| health (ZL state) | ✗ | ✓ | ✗ | ✗ | ✗ |
| zl-health (PM sees team health) | ✗ | ✗ | ✓ | ✗ | ✗ |
| rp-health (PM sees RP health) | ✗ | ✗ | ✓ | ✗ | ✗ |
| coverage | ✓ | ✓ | ✓ | ✗ | ✓ |
| clusters | ✗ | ✓ | ✓ | ✗ | ✗ |
| goals | ✗ | ✗ | ✗ | ✗ | ✓ |
| teams | ✗ | ✗ | ✗ | ✗ | ✓ (via dashboard) |
| phase | ✗ | ✗ | ✗ | ✗ | ✓ (via dashboard) |

**Tab Rendering Logic:** `/app/(app)/home/HomeView.tsx` L4894–4987 (per-designation section renders)

### Navigation (`/app/(app)/AppNav.tsx`)

| Nav Item | RP | ZL | PM | Leader/Other | Admin |
|----------|----|----|----|---------|----|
| Goals (dashboard) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Programme Map | ✓ | ✓ | ✓ | ✗ | ✗ |
| Route Planner | ✓ | ✓ | ✓ | ✗ | ✗ |
| Gantt | ✓ | ✓ | ✓ | ✗ | ✗ |
| Planner | ✓ | ✓ | ✓ | ✗ | ✗ |
| Field Coverage | ✗ | ✓ | ✗ | ✗ | ✗ |
| Effects | ✗ | ✓ | ✗ | ✗ | ✗ |
| Programmes | ✗ | ✓ | ✗ | ✗ | ✗ |
| People | ✗ | ✓ | ✗ | ✗ | ✗ |
| Quarters | ✓ | ✓ | ✓ | ✗ | ✗ |
| Field Notes | ✓ | ✓ | ✓ | ✗ | ✗ |
| Settings | ✓ | ✓ | ✓ | ✓ | ✓ |

**Setup Nav Logic:** `/app/(app)/AppNav.tsx` L47–76
```typescript
const setupNav = (isAdmin || isZL) ? setupNavZL : setupNavRP
```
Non-admin non-ZL users see RP nav (6 items); ZL or admin see extended nav (+Field Coverage, Effects, Programmes, People = 13 items).

### Viewer Badge (`/app/(app)/AppNav.tsx` L169–171)
```typescript
{isViewer && (
  <span>View only</span>
)}
```
Shown in user card if role === "viewer".

---

## Routes/Pages with Per-Role Behavior

| Path | RP | ZL | PM | Leader | Admin | Super-Admin | Viewer | Budget-Admin |
|------|----|----|----|---------|----|-------|--------|-------|
| `/dashboard` | ✓ data scoped | ✓ data scoped | ✓ data scoped | ✓ all data | ✓ all data | ✓ all data | ✗ (403) | ✓ |
| `/home` | ✓ "today" tab | ✓ multi tab | ✓ multi tab | ✓ "today" | ✓ multi tab | ✓ multi tab | ✗ (403) | ✓ |
| `/activities` | ✓ team scoped | ✓ team scoped | ✓ team scoped | ✓ all | ✓ all | ✓ all | ✗ (403) | ✓ |
| `/threads` | ✓ if not RP/ZL/PM, filter by membership; else team scoped | ✓ team scoped | ✓ team scoped | ✓ all | ✓ all | ✓ all | ✗ (403) | ✓ |
| `/needs` | ✗ (403) | ✓ | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/people` | ✗ (403) | ✓ | ✗ (403) | ✗ (403) | — | — | ✗ (403) | — |
| `/sla` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/readiness` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/settings` | ✓ (restricted) | ✓ (restricted) | ✓ (restricted) | ✓ (restricted) | ✓ | ✓ | ✓ (lang only) | ✓ (lang only) |
| `/settings/users` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/settings/templates` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/settings/facility-indicators` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/settings/journey-outcome-packs` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/settings/facility-layers` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/settings/mis-providers` | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✓ | ✗ (403) | — |
| `/budget` | ✗ (redirect) | ✗ (redirect) | ✗ (redirect) | ✗ (redirect) | ✗ (redirect) | ✓ | ✗ (redirect) | ✓ |
| `/budget/admin/budgets` | ✗ (redirect) | ✗ (redirect) | ✗ (redirect) | ✗ (redirect) | ✗ (redirect) | ✓ | ✗ (redirect) | ✓ |
| `/portal` (review portal) | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✗ (403) | ✓ | ✗ (403) | — |
| `/goals/[goalId]` | ✓ (if owner/escalated/coowner/follower or admin) | ✓ (team filter) | ✓ (team filter) | ✓ (all) | ✓ (all) | ✓ (all) | ✓ (read-only) | ✓ |

**Route Guard Implementations:**

- **Admin-gated pages:** `/app/(app)/settings/templates`, `/app/(app)/settings/facility-layers`, etc. redirect or return null if `!isAdmin`  
  - File: Multiple `if (session && !isAdmin) router.replace("/settings");` in useEffect  
  
- **Budget realm:** `/app/(budget)/admin/budgets/page.tsx` L9: `if (!session?.user || !isBudgetAdminOrSuperAdmin(session)) redirect("/budget")`

- **Review portal:** `/app/(review-portal)/layout.tsx` L15: `if (!isSuperAdmin(session)) redirect("/portal")`

- **Needs/People (ZL-only):** No explicit page guard, but data fetches filtered by designation check

---

## Gaps and Ambiguities

### Critical Gaps (High Priority)

1. **No Authorization Check on GET /api/goals** (L1–40)
   - Route is unauthenticated (missing `if (!session?.user?.id)` check)
   - Relies entirely on designation scoping; a malicious client could omit designation and get unfiltered goals
   - **Fix:** Add session check at top of route handler
   - **File:** `/app/api/goals/route.ts` L1

2. **No cityId Scoping Implemented**
   - Schema defines User.cityId but no major query uses it to filter data
   - Unclear if city-based scoping is intentional or missing
   - **File:** `/prisma/schema.prisma` L74–75; `/app/api/admin/users/[id]/route.ts` L18, 58 (can set but not used in scopes)

3. **Designation Check Missing in /api/pitstops/[pitstopId]/partner-briefing**
   - Only role check: `if (role !== "admin" && role !== "super-admin")`
   - No designation-based access (e.g., should ZL/PM be allowed?)
   - **File:** `/app/api/pitstops/[pitstopId]/partner-briefing/route.ts` L22

4. **Unconfirmed: /api/programmes, /api/programmes/[id] Authorization**
   - No authorization check found in route handler
   - Unclear if programme-level scoping exists
   - **Action:** Check `/app/api/programmes/route.ts` and `[id]/route.ts`

### Inconsistencies (Medium Priority)

5. **Admin Email Fallback vs. Role Column Confusion**
   - Super-admin determined by:
     - DB role column (`"super-admin"`)
     - OR matching ADMIN_EMAIL env var  
     - OR matching NEXT_PUBLIC_ADMIN_EMAIL (client-side config)
   - Three sources of truth; can diverge if env vars change
   - **Files:** `/lib/auth.ts` L56–63, L85–87, L97–99, L110–112; `/app/(app)/settings/page.tsx` L13

6. **Viewer Role Inconsistent Handling**
   - `/app/(app)/settings/page.tsx` L14–15: treats viewer specially (read external calendar URL, can't edit)
   - `/lib/roleGuard.ts` L17–22: viewerForbidden() returns 403 for mutations
   - But `/app/(app)/layout.tsx` line 21: isBudgetAdmin check does NOT exclude viewers
   - Unclear if budget-admin viewers are allowed or should redirect
   - **File:** `/app/(app)/layout.tsx` L21

7. **Threads Page Designation Logic Unclear**
   - `/app/(app)/threads/page.tsx` L46: `if (!isAdmin && (designation === "RP" || designation === "ZL" || designation === "PM"))`
   - Filters threads by team IF non-admin AND one of field designations
   - What does Leader or Other designation see? (Not specified)
   - **File:** `/app/(app)/threads/page.tsx` L40–60

8. **Dashboard vs. Home Data Duplication**
   - Both `/dashboard` and `/home` fetch similar scoped goal/pitstop data
   - Scoping logic duplicated in `/app/(app)/dashboard/page.tsx` and `/app/(app)/home/page.tsx`
   - Could diverge if one is updated and other isn't
   - **Files:** `/app/(app)/dashboard/page.tsx`, `/app/(app)/home/page.tsx`

### UI/UX Gaps (Low Priority)

9. **Settings Tabs Not Restricted by Role in Navigation**
   - User can manually navigate to `/settings/users` URL even if not admin
   - Page redirects inside useEffect (L55–57), not at component render
   - Causes flash/lag before redirect
   - **File:** `/app/(app)/settings/users/page.tsx` L55–57

10. **No Audit Logging for Sensitive Actions**
    - User edit, role change, password reset, admin access to review portal
    - AuditLog model exists but not used in these handlers
    - **Files:** All `/app/api/admin/*` routes

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **Role/Designation String Literals** | 50+ |
| **Designation Checks (if designation === "X")** | 70+ |
| **Admin Role Checks (isAdminUser / isAdmin)** | 40+ |
| **Data-Scoping Queries (ownerId, reportsToId filters)** | 25+ (in home/dashboard/activities pages) |
| **UI Conditional Renders ({designation && ...})** | 20+ |
| **Route Guards (if !isAdmin) router.replace)** | 10+ |
| **API Authorization Checks** | 20+ |
| **Settings/Config Pages with Admin Gates** | 8 |
| **Navigation Items per Role** | 6–13 |
| **Home Page Tabs by Designation** | 5 designs (RP, ZL, PM, Admin, Other) |

---

## Recommended Next Steps

1. **Implement Centralized Permission Service**
   - Replace scattered `designation === "X"` checks with `ability.can("read:goal", goal)` pattern
   - Use CASL or similar library for declarative permissions

2. **Create Permission Matrix Store**
   - Extract all `role × action × resource` combinations into a config file
   - Version & migrate as org structure evolves

3. **Unify Data-Scoping Logic**
   - Build `getCurrentUserScope(session)` helper returning { ownIds: [], clusterIds: [], zoneIds: [] }
   - Use in all Prisma queries; test against known scope rules

4. **Audit & Fix Gaps**
   - Add session check to `/api/goals`
   - Clarify cityId scoping requirement
   - Document designation hierarchy in code comments
   - Implement audit logging for admin actions

5. **Test Coverage**
   - Unit tests for permission checks (per role × action)
   - Integration tests for data-scoping queries (ensure RP can't read other RP's goals)
   - E2E tests for redirect/403 behavior per role
