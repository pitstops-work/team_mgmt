# Urban Operations — Phase 0 spec

Status: draft v2 (open questions answered) · 16 Nov 2026
Pilot: Creche + Welfare Rights (incl. the Scheme Linkage drive) · fresh data · admins first · URL `/urban`

---

## 1. What this is for

Partner organisations deliver the programmes. Their staff (caregivers, supervisors,
community organisers, cluster coordinators) run the creche day to day or the
entitlements work, and record it in **their own MIS**: Shishughar for creches,
Frappe for welfare rights.

**Our RP does not deliver. The RP sets the partner up, then checks, supports and
reviews their work on a regular rhythm.** Every line in today's templates says so:
"Ensure the partner team…", "Confirm…", "Validate… (field visit)", "MIS data
cross-checked with field register".

So Urban Operations is the RP's **support-and-review tool**:

1. **Set up**: help a partner get a programme ready (approvals, team, space, training,
   MIS live), confirming each piece with evidence.
2. **Review on a rhythm**: weekly, fortnightly or monthly routines. Visit the field, meet
   or call the partner team, check their MIS against reality, rate what was seen.
3. **Follow up**: anything not right becomes an action, owned by us or by the partner,
   until it is closed.
4. **Read the numbers**: at each review, record the few figures that matter from the
   partner's MIS. Over time those figures show whether the need is closing.

It is **not** an MIS. It never holds child registers, household line-lists or case files.
Those stay with the partner. We hold what we checked, what we found, what we asked for,
and the headline numbers.

It is an **internal tool. Partner staff never log in.** When a follow-up belongs to the
partner, the RP records it, chases it, and closes it once it's confirmed.

---

## 2. Rules fixed from day one

These are fixed because breaking them is what made the current system inconsistent.

| # | Rule |
|---|---|
| R1 | **One access check** (`can(user, action, thing)`), called by every route and page. A test fails the build if any route skips it. |
| R2 | **One date helper, in IST.** Nothing else computes "today", "this week" or "this month". |
| R3 | **Every number on screen comes from a database view.** Screens never count for themselves, so no two screens can disagree. |
| R4 | **Every write logs an Event** (who, what, when, before → after, reason). |
| R5 | **Programme settings are stored once.** Editing them changes future work; done work never changes. No resync button, no frozen snapshot. |
| R6 | **Roles mean one thing**, defined only inside the access module. |
| R7 | **Nothing disappears.** A rescheduled, overdue or reopened item stays in every list it belongs to. |

---

## 3. The model

Ten tables, all new, prefixed `uo_`, in the same database. The only links to the
existing app are `User` (sign-in), and Partner names copied from the partner registry.

### Setup (admin-owned)

| Table | Holds | Key fields |
|---|---|---|
| **Place** | One tree: city → zone → cluster → settlement → site | `parentId`, `level`, `name`, `lat/lng`, `legacyId` (copied once from today's geography) |
| **Partner** | The organisations doing the work | `name`, `mis` (e.g. "Shishughar", "Frappe"), `legacyOrgId` |
| **Programme** | Settings for one kind of work (§4) | `key`, `name`, `version`, `settings` (structured JSON), `active` |
| **Assignment** | Who covers what | `userId`, `placeId`, `programmeKey?` (blank = all programmes) |

### Work

| Table | Holds | Key fields |
|---|---|---|
| **Effort** | One running instance: "Creche – Ambedkar Nagar (Partner X)", "Welfare Rights – KR Puram cluster (Partner Y)" | `programmeKey`, `placeId`, `partnerId?` (blank for a city-level effort that spans partners), `ownerId` (the RP), `startMode` (new · already_running), `startedOn`, `phase` (setting_up · running · closed), `closedReason` |
| **Task** | **Every unit of work**: a setup item, an item inside a session, a follow-up | `effortId`, `kind` (setup · session · followup), `sessionId?`, `key` (stable, from settings), `title`, `ownerId`, `who` (us · partner), `due`, `status` (open · done · skipped), `check` (§4.3), `result` (answer / rating / number), `doneAt`, `doneBy` |
| **Session** | One run of a routine: a visit, a review meeting or a call | `effortId`, `routineKey`, `period` (e.g. 2026-11 or 2026-W47), `mode` (visit · meeting · call), `startedAt`, `arrivedAt?`, `closedAt`, `closedNote` |
| **Evidence** | A voice note, photo or file attached to a task | `taskId`, `kind`, `url`, `transcript?` |
| **Reading** | A number at a date: an MIS figure or an outcome | `effortId`, `key` (from settings), `dimension?` (e.g. the scheme, for entitlements), `value`, `asOf`, `sessionId?`, `source` (manual · api · observed). One row per (effort, key, dimension, asOf), so a later API sync writes the same rows a person would type. |
| **Event** | Append-only history | `actorId`, `entity`, `entityId`, `action`, `before`, `after`, `reason`, `at` |

`Need` is a **database view**, not a table: the assessment population per place,
the programme's formula, minus what exists.

### How the pieces fit

```
Programme settings ──► Effort (in a Place, with a Partner, owned by an RP)
                          ├─ setup Tasks            (one-time, dated from startedOn)
                          ├─ Sessions per routine   (each holds its own session Tasks)
                          ├─ follow-up Tasks        (us or partner, with a due date)
                          └─ Readings               (MIS figures recorded at sessions)
Need (view) ── compared with ──► Readings marked "outcome"  ⇒  need closing over time
```

Phase is **derived, never set by hand** (the `uo_effort_status` view): `setting_up` until
every required setup task is done or skipped; then `running` if the programme has
routines, or `ready_to_close` if it has none (a drive waiting for its explicit close);
`closed` only by an explicit close with a reason.

**Starting an effort: new or already running.** Each setup item says whether it
`applies_to` **new** efforts, **already-running** efforts, or **both**. A new creche gets the
full 106-day setup. A creche that is already open starts with no setup and goes straight
to its routines. An already-running Welfare Rights cluster gets only the one-time
catch-up items, such as civic-amenities mapping. This replaces the separate "(existing)"
templates.

---

## 4. Programme settings

A programme is a settings document. Admins edit it in the Programmes screen. Adding a new
kind of work means writing settings, not code.

```yaml
key: creche
name: Creche
place_level: site            # where an Effort sits: site · settlement · cluster · city
partner_mis: Shishughar
setup:                       # phases → items; each item becomes a setup Task
  - phase: Permissions
    items: [ {key, title, due_in_days, due_in_days_running?, check, required, applies_to: new|already_running|both} … ]
    # due_in_days_running: a different due day for already-running efforts (catch-up items)
routines:                    # zero or more; each produces one Session per period
  - key, name, cadence (weekly · fortnightly · monthly), mode (visit · meeting · call),
    items: [ {key, title, check, required} … ]
readings:                    # numbers the RP records from the partner's MIS
  - key, label, unit, outcome: true|false, per: scheme   # optional dimension
integration:                 # optional, for later; the pilot enters readings by hand
  source: frappe             # a sync job maps MIS fields → reading keys
need:                        # the formula behind the Need view
  population: children_6m_3y   # from the assessment
  per_unit: 20                 # one creche per 20 children
  existing: existing_creches
```

### 4.1 Cadence
`weekly` = one session per IST week (Mon–Sun). `fortnightly` = 1st–15th and
16th–end of month. `monthly` = calendar month. **Due** = the end of the period.
**Missed** = the period ended with no closed session.

### 4.2 Due dates
Setup items: `startedOn + due_in_days`. Moving a due date is a **reschedule**: it needs a
reason, writes an Event, and the task stays in every list (R7). Weekends are allowed;
nothing silently snaps.

### 4.3 How a task is checked (`check`)

| check | The RP… | Done when |
|---|---|---|
| `tick` | marks it done | ticked |
| `voice` | records a short voice note (transcribed) | a note exists |
| `photo` | attaches a photo or file | a file exists |
| `rating` | rates a list of points OK / Not OK / N-A; points can be **non-negotiable** | every non-negotiable rated; any non-negotiable Not OK **raises a follow-up automatically** |
| `number` | enters a figure (writes a Reading) | a value is entered |
| `observation` | runs a structured observation (e.g. caregiver practices) | observation saved; flagged practices **raise follow-ups** |
| `note` | writes what was agreed or found | text entered |

A task can also **raise follow-ups** by hand: "Ask partner to…" (`who: partner`) or
"I need to…" (`who: us`), each with a due date.

### 4.4 Closing a session
A session closes when every `required` item is done. Closing early needs a reason;
the open items move to follow-ups and are not lost.

---

## 5. Pilot programme A — Creche

Sources: templates `creche-program`, `creche-program-existing`,
`creche-program-existing-copy`; the 24-point safety audit; the 93 caregiver practices.
**Place level: site** (one Effort per creche). **Partner MIS: Shishughar.**

### 5.1 Setup (≈106 days; **new** creches only. An already-running creche skips setup.)

| Phase | Items (check) | Due |
|---|---|---|
| **Approval** | Partner identified & oriented (tick) · Children 6m–3y estimated from secondary data (number) · Number of creches agreed (number) · Budget & proposal prepared (photo) · Budget approved (tick) · Agreement signed (photo) · 1st tranche disbursed (tick) | day 45 |
| **Team** | Partner staff recruited (tick) · Induction + exposure visit done (voice) · Local govt stakeholder informed (tick) | day 60 |
| **Space** | Suitable space identified (photo) · Safety check of the space, with the renovation list (rating, 24-point) · Renovation complete (photo) · Creche profile created in Shishughar (tick) · Household listing added in Shishughar (tick) | day 75 |
| **Community** | Community meeting held in each slum (voice) · Minutes / resolution / attendance on record (photo) | day 90 |
| **Caregivers** | Shortlisted on the 10-point criteria (tick) · Background check & documents done (tick) | day 95 |
| **Procurement** | Vendors approved (tick) · Equipment procured (growth, cooking, fire safety, first aid, bedding, play) (photo) · LPG account set up (tick) · Registers & collaterals procured (tick) · Stock register complete (photo) | day 97 |
| **Training** | 5-day pre-service training held (voice) · Competency assessment of all trainees (number: % passed) · Materials & registers given to each caregiver (tick) | day 103 |
| **Launch** | Facility readiness, 24-point safety (rating) · Pre-opening community meeting (voice) · Materials, play materials, water & toilet verified (tick) · Creche inaugurated, children enrolled (number: children enrolled) | day 105 |
| **Health links** | ANM / AWW / ASHA contact established (tick) · Growth-monitoring schedule verified (tick) · Referral pathways to PHC/CHC and NRC set (tick) · Caregivers briefed on A/B/C alerts (voice) | day 106 |

### 5.2 Routines (once running)

| Routine | Cadence · mode | Items |
|---|---|---|
| **Creche visit** | monthly · visit | Arrived at the creche (on "I've reached") · Safety & hygiene, 24-point (rating; non-negotiables raise follow-ups) · Caregiver practices (observation) · Health referrals followed through (tick) · Shishughar register matches what I saw (tick, with a note if it doesn't) · Readings from Shishughar (number) |
| **Supervisor & caregiver review** | fortnightly · call | Shishughar data cross-checked with the field register before the call (tick) · Review held with the partner supervisor & caregivers (voice) · Action items agreed and shared (note → follow-ups for the partner) |
| **All-partner meeting** | monthly · meeting · **one city-level Effort** (no single partner). Built as its own small programme, *Creche all-partner meeting* (place level city), because Creche efforts sit at site level. | Meeting facilitated (voice) · Actions shared (note) |

### 5.3 Readings (from Shishughar, at the monthly visit)
`children_enrolled` (outcome) · `avg_daily_attendance` · `children_underweight` ·
`referrals_open`.

### 5.4 Need
`floor(children_6m_3y ÷ 20) − existing_creches`, per settlement, from the latest
assessment. This is today's formula, kept as is. **Delivered** = running creche Efforts,
plus `children_enrolled`.

---

## 6. Pilot programme B — Welfare Rights (with Scheme Linkage drives)

Sources: **`welfare-rights-copy` (new) for setting up a new WR programme**, and
**`welfare-rights-temp` (temporary) as the current model for running programmes**, plus
`scheme-linkage-drive`. The older `welfare-rights` (existing) template is **superseded**
and not carried over. **Place level: cluster** (one Effort per cluster, about 5,000 HH
across 6–8 settlements). **Partner MIS: Frappe.**

The partner team runs community groups, MAS, stakeholder forums, civic mapping and
entitlement applications. The RP gets them set up, then validates and reviews.

### 6.1 Setup (≈90 days; from the "new" template, for **new** clusters)

| Phase | Items (check) | Due |
|---|---|---|
| **Team** | Partner team recruited: PM, CCs, RCCs, MIS coordinator, COs (number: COs in place) · Induction held (voice) · COs assigned to settlements (tick) · Team channel & review rhythm set (tick) | day 21 |
| **Mapping** | Settlements listed & households enumerated (number: HH) · Existing community groups & MAS mapped (number each) · PHC / Anganwadi / schools / police located (tick) · Community leaders identified (tick) | day 35 |
| **CO training** | 3-day CO orientation held (voice) · Tools, registers & app access given out (tick) · Year-1 training calendar shared (photo) | day 45 |
| **MIS live** | App installed & accounts created for all COs (tick) · COs trained on data entry, entitlement & DV tracking (voice) · Coordinator dashboard & MAS module configured (tick) · First data-quality review, 2 weeks after go-live (note) · Monthly reporting rhythm set (tick) | day 60 |
| **Baselines** | Civic-amenities mapping done, 7 categories, all settlements (photo: compiled findings) · Reports shared with groups (tick) · Top 3 issues per settlement prioritised (note) · Household line-listing done & validated (tick) · Eligible households per scheme recorded (number, per scheme) | day 90 |

**Already-running clusters** get only the "temporary" template's one-time items, dated from
the start: COs trained on the mapping tool (voice, day 1) · Civic-amenities rollout visited
(tick, day 7) · Other civic issues mapped (tick, day 10) · Compiled findings reviewed (photo,
day 15) · Reports shared (tick, day 16) · Top 3 issues prioritised (note, day 20) · Eligible
households per scheme recorded (number, per scheme, day 30).

### 6.2 Routines (once running; from the "temporary" template)

| Routine | Cadence · mode | Items |
|---|---|---|
| **Cluster review** | weekly · meeting | Each settlement has a community group meeting to guideline (note) · GBV incidents reported & plan of action (note) · MAS formed, gaps, challenges, next steps (note) · Community leaders identified, status, monthly leaders' meeting planned (note) · Federation of groups (cluster & city) roadmap & status (note) · Scheme bucketing list reviewed in Frappe: applications & challenges (number readings, per scheme) · Actions agreed (→ follow-ups for the partner) |
| **Land title & housing rights** | monthly · meeting | COs trained on land-title eligibility & process (voice) · Eligible households identified per settlement (number) · Monthly applications status, challenges & follow-up plan reviewed (note + readings) |

*Not carried over*: the superseded "existing" template's monthly validation and
programme-review routines. If parts of them are still wanted (e.g. attending one MAS
meeting a month), they can be added back as items here.*

### 6.3 Readings (from Frappe; typed in at the review for now, API sync later)

| Reading | Per scheme? | Outcome? |
|---|---|---|
| `eligible_households` | yes | (the denominator) |
| `applications_filed` | yes | |
| `entitlements_received` | yes | **yes** |
| `active_groups` · `mas_active` | | |
| `gbv_cases_open` · `gbv_referrals` | | |
| `housing_applications_filed` · `housing_applications_resolved` | | |

**Schemes** are a list in the programme settings, editable by admins. Starting list, from
the Scheme Linkage template: CMCHIS · PMJAY · PMJJBY · PMSBY · APY · welfare pensions ·
PMAY · voter ID, plus the documents behind them (Aadhaar, income certificate, ration card,
Jan Dhan).

### 6.4 Scheme Linkage drive: a time-boxed programme
A drive is just a programme with **setup only and no routines**. It runs alongside the
cluster's Welfare Rights effort and closes with a written review. **Place level: cluster.**

| Phase | Items (check) | Due |
|---|---|---|
| **Workflow** | Sample cases identified (photo) · Workflow document drafted, reviewed & shared (photo) | day 14 |
| **MIS ready** | Frappe doctype & dashboards updated (tick) · Piloted with a small team (voice) · Live, with field fixes applied (tick) | day 35 |
| **Training** | Orientation for all relevant staff (voice) | day 42 |
| **Quick wins** | Simple cases targeted, complex cases separated out (number: simple / complex) · Handholding & catch-up rhythm running (note) | day 72 |
| **Complex cases** | Reasons for complexity synthesised (note) · Workflow refined in Frappe (tick) | day 102 |
| **Closure** | Reasons for incomplete cases validated (note) · Final figures (number: applied / received per scheme) · Drive closed with a written review (photo) | day 109 |

### 6.5 Need = saturation per scheme
For each scheme in each cluster:
**saturation % = entitlements_received ÷ eligible_households**, using the latest reading
of each. **Need remaining = 1 − saturation.** The Programme screen shows a cluster ×
scheme grid of saturation %, rolling up to zone and city by summing received and eligible
(never by averaging percentages). Coverage, meaning which clusters have a running WR
effort at all, shows alongside it.

---

## 7. Screens

Mobile-first. Six screens in total.

| Screen | Who | What it shows |
|---|---|---|
| **Today** | RP (also ZL/PM/Leader for their own work) | One list: overdue first, then due today, then this week. Covers setup tasks, sessions due this period, and follow-ups owned by me. Partner follow-ups that are due show under "Waiting on partner". |
| **Effort** | Everyone with access | Header: place · partner · phase · next due. **Setting up**: phases → items, each closed by its check. **Running**: each routine with "x of y this period" and a **Start** button that opens the session (visit: "I've reached" → items → close). Follow-ups (us / partner). Readings over time. Full history from Events. |
| **Team** | ZL · PM · Leader | Exceptions only, for the people under me. Efforts stuck in setup (and at which item). Routines missed this period. Overdue follow-ups, split us vs partner. Repeat reschedules. Non-negotiables failing. Click → the Effort. |
| **Programme** | Leader · PM | Per programme: a map and a table of need vs delivered, by city → zone → cluster → settlement, and the trend of outcome readings. Click a place → its Efforts. |
| **Programmes** | Admin | Edit programme settings (§4), with a preview of what a new effort would get. |
| **People & places** | Admin | Users, roles, reporting line, assignments (who covers which places and programmes). Partners. |

No separate calendar, Gantt, planner, timeline or threads. Each of those is a filter on
Today or Team, or a comment on a task.

---

## 8. Definitions (one each, used everywhere)

| Term | Definition |
|---|---|
| Overdue | `status = open` and `due` < today (IST) |
| Due this period | a routine with no closed session in the current period |
| Missed | a routine period that ended with no closed session |
| Stuck | setting up, and either no setup task done in 14 days or the next required task overdue |
| Cadence % | closed sessions ÷ periods due, for a chosen window |
| Delivered | the latest value of each outcome reading, summed over Efforts in the place |
| Need remaining | count needs (creche): Need (view) − delivered, never below 0 · saturation needs (entitlements): 1 − Σreceived ÷ Σeligible, per scheme |

---

## 9. Who can do what

Roles: **RP · ZL · PM · Leader · Admin.** Reporting lines come from the user's `reportsTo`.

| | RP | ZL / PM | Leader | Admin |
|---|---|---|---|---|
| See efforts | in my assigned places | mine + my reports' (whole subtree) | everything | everything |
| Do tasks, run sessions | efforts I own | efforts I own; can **step in** on a report's effort (logged) | same as ZL/PM | any |
| Create efforts | no | yes, for my reports | yes | yes |
| Reassign / close efforts | no | my reports' | any | any |
| Edit programmes, people, places | no | no | no | yes |

Every rule above lives in one `can()` function (R1, R6). Viewing as another user is
read-only and enforced on the server, not just in the browser.

---

## 10. Build plan

| Phase | Delivers | Done when |
|---|---|---|
| **0 · Spec** | This document, agreed | Creche and Welfare Rights settings signed off by whoever runs each |
| **1 · Skeleton** | `/urban` route group + portal card (admins only) · `uo_` tables · `can()` + its build test · IST helper · Places & Partners imported · Programmes and People & places screens · Creche + Welfare Rights + Scheme Linkage entered as settings | An admin can create an Effort and see its setup tasks generated from settings |
| **2 · RP loop** | Today · Effort page · every check type (§4.3) · sessions · follow-ups (us / partner) · reschedule with reason · Events | An admin runs one creche and one WR cluster end to end on a phone, setup through two routine periods |
| **3 · Oversight & numbers** | Readings · Need view · Team screen · Programme screen · first field users (2–3 RPs + their ZL) | Need vs delivered for the pilot places matches a hand count |
| **4 · Widen** | Remaining programmes as settings · migrate what's worth keeping · retire old pages one by one | — |

---

## 11. Decisions taken

| # | Question | Decision |
|---|---|---|
| Q1 | Partner as a user? | **Never.** An internal tool; RPs record and close partner follow-ups. |
| Q2 | MIS numbers by hand or synced? | **By hand for now.** Readings are keyed so an API sync (the systems do have APIs) can write the same rows later; `source` records which. |
| Q3 | Welfare Rights / entitlements need | **Saturation % of each scheme or entitlement** (§6.5). |
| Q4 | City-level routines | **City-level Effort** (the all-partner creche meeting). |
| Q5 | Which WR template | **"Temporary" = running programmes (routines); "new" = new programmes (setup).** "Existing" is superseded. |
| Q6 | URL | **`/urban`** |
| Q7 | Letting field users in | **People & places → "Can open"** (stored in `uo_member`); no redeploy. `URBAN_PILOT_EMAILS` still works as a fallback. |

Still worth a read by whoever runs each programme: the item lists in §5 and §6.
