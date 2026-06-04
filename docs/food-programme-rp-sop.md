# Food Programme — Resource Person Field SOP & Checklists

**Programme:** Bangalore Urban Food Distribution (Sampark × Ramani Food, scaling)
**Launch scope:** 1,500 units/day, 1 kitchen, 2 trucks, 5 DPs, 6 months, ₹82.30L grant
**Design scope:** scalable to Ramani's full ~15–20k meals/day across ~60 DPs and multiple kitchens
**Distribution model:** Drop → Serve → Collect, FILO loading, TATA Ace fleet
**RP working hours:** 02:00–11:00 daily (confirmed with vendor)
**Companion app:** `food_app` (Kitchen / Driver / DP / Manager roles, QR-tracked containers, GPS, Reconciliation cron at 10:30 AM)
**Pitstops templates that already exist:** Launch & Operationalisation, Monthly Review, New DP Activation (`GoalTemplateDef` table, see `scripts/seed-food-programme.ts`).
**Companion artefact:** `docs/food-programme-rp-effort-calculator.xlsx` — converts (meals/day, kitchens, trucks, DPs) into RPs required.

> This document is the **operational layer** that the existing strategic Pitstops templates do not cover — the RP's daily field routine at kitchen, truck and DP, plus the cross-cutting reviews (procurement, dignity, crowd, hygiene, wastage).
>
> **Scale-agnostic.** The SOP is written in terms of N kitchens, T trucks, D DPs — not the launch numbers. The headcount required to staff it is computed by the effort calculator (Annexure A).

---

## 0. How to use this document

| Audience | Use it for |
|---|---|
| RP (daily) | Section 2 timeline + the three checklists in §3, §4, §5. Print laminated copies for kitchen and vehicle. |
| RP (weekly/monthly) | Section 6 cross-cutting reviews. These feed the Pitstops "Monthly Operations Review" goal. |
| ZL / Programme lead | Section 7 escalation matrix + Section 8 reporting cadence. |
| Implementation lead | Section 9 phased rollout. Maps each new artefact to either an existing Pitstops template or a recurring goal we still need to seed. |

**Principle:** the RP is not an auditor. The RP is the **operator-of-record**. If the kitchen is late or a DP runs out of food, the RP is accountable for noticing, escalating, and writing down what we learn. Vendor risk sits with Sampark contractually but quality risk sits with us.

---

## 1. Programme baseline (read once, then refer)

### 1.1 Operations clock

| Time | Where | Who | What |
|---|---|---|---|
| 02:00 | Kitchen | Ramani team | Procurement check-in, first-batch prep starts |
| 02:00 | Kitchen | **RP** | Arrives. Day-start audit (§3.A). |
| 04:00 | Kitchen | Ramani | Food ready, containers filled, kits staged |
| 04:30 | Kitchen | Ramani + Driver | **Kitchen readiness gate** — all kits weighed, sealed, QR-scanned `FILLED` |
| 04:30–05:00 | Kitchen bay | Driver + 2 loaders | **FILO loading** — last-DP-first. Containers scanned `LOADED`. |
| 05:00 | Kitchen gate | Driver | **Dispatch** (`Route.dispatchedAt` stamped). RP rides along OR shadows by bike. |
| 05:30 | DP 1 | DP staff + Driver | Setup → serve start. Container scanned `DELIVERED`. |
| 06:00 | DP 2 | DP staff + Driver | Serve start. |
| 06:30 | DP 3 (shelter, if applicable) | Driver | Driver personally serves. |
| 07:30 | DP 1 | Driver | Pickup loop begins. Container scanned `PICKED_UP`. |
| 08:30 | DP 3 | Driver | Last pickup. |
| 10:00 | Kitchen | Driver | Return (`Route.arrivedAt` stamped). |
| 10:15 | Kitchen | Kitchen team + RP | Weigh-back (`returnedKg`), clean, kits stored. `RETURNED`. |
| 10:30 | (system) | Cron | `Reconciliation` row auto-generated. |
| 10:30–11:00 | Anywhere | RP | Daily report, exception triage, log next-day issues. |

### 1.2 Fleet & rotation

The kitchen dispatches **T trucks**, each serving **k DPs** per route (FILO loading limits k to ~3 per route with a TATA Ace). One RP can shadow only one truck per day. Standing rule:

- Every truck shadowed end-to-end **at least twice per week**
- Every DP observed during serving **at least twice per week**
- Build a 6-day rolling rotation so coverage is even across trucks and DPs

The effort calculator (Annexure A) sizes RPs from these two rules. Quick check: one RP can cover ~6 DPs per day (3 on truck-follow + 3 independent), giving ~36 DP-visits/week — sufficient if `D × 2 ≤ 36`, i.e. up to ~18 DPs from one kitchen with one RP. Beyond that, add field RPs.

### 1.3 Transport for the RP — hybrid model

A cab for the whole 9-hour shift is neither frugal nor practical (DPs sit in lanes a cab will refuse). Riding in the truck cab traps the RP on one route and slows the truck. The model:

| Leg | Mode | Why |
|---|---|---|
| Home → Kitchen (01:30–02:00) | **Programme-paid cab** | Night travel safety. Non-negotiable. |
| Kitchen morning (02:00–05:00) | On foot, inside premises | Stationary work |
| Truck-follow (05:00–07:30) | **RP's own two-wheeler, riding behind the truck** | Frees the truck cab; lets RP peel off / catch up; fits all parking constraints at DPs |
| Independent DP rounds (07:30–09:30) | RP's own two-wheeler | DPs are in lanes / nakas inaccessible to cabs |
| Return to kitchen (09:30) | Two-wheeler | — |
| Kitchen → Home (post-11:00) | Two-wheeler (daylight) **or** programme-paid cab if RP reports tiredness, rain, or safety concern | RP's call, no questions asked |

**Where the two-wheeler lives:** at the kitchen overnight. The cab driver drops the RP at the kitchen; the two-wheeler is collected from kitchen parking for the day's rounds. Kitchen Manager allots a covered parking slot as part of launch onboarding.

**Fuel & maintenance:** flat monthly two-wheeler allowance, paid by us (added to RP cost in the calculator — `rp.twowheeler_allowance_per_month`). Service receipts filed quarterly.

**Safety floor (hard rules):**
- No two-wheeler ride before sunrise. Pre-sunrise legs (the home-to-kitchen one) are **always** by cab, even if RP "doesn't mind". This is policy, not preference.
- Helmet mandatory; visibility jacket during truck-follow.
- If it's raining at 05:00, truck-follow shifts to riding **inside** the cab for that day. Only one RP per truck.
- RP is never solo on a route after 21:00 in any DP area.

**Cab approval discretion:** ZL can authorise unlimited daily cabs for a specific RP for up to 7 consecutive days (illness, vehicle in service, monsoon week). Beyond 7 days requires programme-lead approval.

### 1.4 What we own vs. what the vendor owns

| Owns | Sampark / Ramani | Us (RP) |
|---|---|---|
| Production volume & food cost | ✅ | — |
| FSSAI / FoSCoS compliance | ✅ | Verify cert valid; flag breaches |
| Driver, fuel, vehicle | JustDelivery via Sampark | Verify GPS-logging on; flag absence |
| DP personnel hiring | Sampark | Sign off on each hire; mock-train each |
| Crowd, dignity, hygiene at DP | Shared | **Primary observer & corrector** |
| Kit integrity (QR, count, condition) | Driver + DP | **Daily reconciliation owner** |
| Wastage data (`returnedKg`) | Kitchen weigh-back | **Trend owner; portion-size recommender** |

**Hard rule:** the RP does not handle money, does not handle hiring/firing of vendor staff, does not negotiate vendor price. The RP **observes, documents, escalates**.

---

## 2. RP Daily Timeline (the 9-hour shift)

```
02:00 ────────────────────────────────────────────────────────────────────────
        Kitchen — Day-Start Audit (§3.A)
        - Procurement & stores check
        - Hygiene gate-walk
        - Cook line + temperature check
        - FSSAI / pest / water log spot-check
04:00 ────────────────────────────────────────────────────────────────────────
        Kitchen — Filling & Sealing (§3.B)
        - Container weigh-in (`filledKg`)
        - QR scan, lid seal
        - Photo each container (per food_app)
04:30 ────────────────────────────────────────────────────────────────────────
        Kitchen Bay — FILO Loading (§3.C)
        - Load order matches reverse-DP sequence
        - Kit items numbered & checked off
        - Driver briefing
05:00 ────────────────────────────────────────────────────────────────────────
        Truck-Follow (§4) — RP on own two-wheeler, 20–30m behind truck
        - Pick truck-of-the-day per rotation
        - DP1 → DP2 → DP3 of that truck
        - Observe setup, queue, serve, pickup
        - Rain day → ride in cab instead (§1.3)
07:30 ────────────────────────────────────────────────────────────────────────
        DP Rounds (§5)
        - Drop off truck after DP3
        - Visit 2–3 DPs of the OTHER truck during serve OR pickup
        - 6 DPs total per day across both trucks
09:30 ────────────────────────────────────────────────────────────────────────
        Return to Kitchen — Reconciliation (§3.D)
        - Witness weigh-back
        - Spot-check `returnedKg` vs `headcountServed × 400g`
        - Kit count reconcile
10:15 ────────────────────────────────────────────────────────────────────────
        Daily Wrap (§8)
        - Verify Reconciliation row (auto at 10:30)
        - Resolve open Exceptions (`food_app`)
        - WhatsApp summary to ZL
        - Flag any escalations
11:00 ────────────────────────────────────────────────────────────────────────
        Off-shift
```

**Pre-shift the night before (15 min):** check the next-day rotation, weather, any special-day notes (festival, civic event, rains), and that DP personnel WhatsApp group has acknowledged the morning. **Book the night cab** for 01:30 pickup. If the next day shows rain in forecast, switch the truck-follow leg to in-cab and inform driver.

---

## 3. SITE A — Kitchen (Ramani Food, Whitefield)

The kitchen is where ~95% of failure modes start: late food, wrong temperature, undercooked, contaminated, wrong quantity. RP presence between 02:00 and 04:30 is non-negotiable.

### 3.A Day-Start Audit Checklist (02:00–04:00)

**STORES & PROCUREMENT**
- [ ] Day's menu posted on kitchen board, matches the weekly menu calendar
- [ ] Raw materials for the day visible in cook line (rice, dal, oil, vegetables, masala)
- [ ] Buffer stock for tomorrow visible in dry store (≥ 1 day's rice + dal + oil)
- [ ] Vegetable lot — visual quality check, no rot / no foul smell. **Reject criteria documented in §6.A.**
- [ ] Oil — single batch, freshly opened or partially used (not visibly dark/used)
- [ ] Cold-chain items (curd, paneer, eggs if applicable) within use-by, stored ≤ 5°C
- [ ] Procurement bills for the previous day filed (sample 3 per week, photograph)

**HYGIENE GATE-WALK**
- [ ] Floor washed, no standing water in cook area
- [ ] All cooks in apron + headcap + closed footwear; no jewellery on hands
- [ ] Handwash station has soap + water + drying paper/cloth
- [ ] No mobile phones at cook line
- [ ] Pest control log signed for the previous night (rat-traps / fly-screens / drain covers)
- [ ] Garbage from previous shift cleared; no overflow

**WATER & FUEL**
- [ ] Water tank level visually full or topped to "OK" mark
- [ ] LPG/PNG sufficient for the shift (manifold pressure or cylinder weight)
- [ ] Cooking thermometer present at cook line (calibrate weekly — see §6.D)

**COMPLIANCE LOGS**
- [ ] FSSAI / FoSCoS licence visible and within validity
- [ ] Daily temperature log started for the day
- [ ] Pest log updated
- [ ] Yesterday's `Reconciliation` (from `food_app`) printed — any open exception revisited

> **Voice note** (`food_app` Exception with audio): if anything above is amber/red, the RP records a 30-second voice note before leaving the kitchen so it is timestamped before food leaves.

### 3.B Filling & Sealing Checklist (04:00–04:30)

This is the moment we **lock in** the daily commitment. Every container that leaves wrong, leaves wrong for 8 hours.

For **each container** (target: ~6 per truck × 2 trucks = 12 containers/day):

- [ ] Container inner-lining inspected — no dents, no chipped enamel, no stale smell
- [ ] Container weighed empty (kitchen scale, witnessed)
- [ ] Container filled to planned grams (units planned × 400g + 5% buffer)
- [ ] Container weighed full → `filledKg` entered in `food_app` Kitchen screen
- [ ] Lid seal tight; locking latch engaged
- [ ] QR scanned by Kitchen role → status `FILLED` (event row created)
- [ ] Photo captured per container (`filledPhotoUrl`)
- [ ] Container labelled with DP name + truck number (laminated card slipped in latch loop)

**Cook-line temperature spot-check (random 3 containers/day):**
- [ ] Thermometer probe at container core
- [ ] Reading **≥ 65°C** at fill, otherwise container goes back to cook line for re-heat
- [ ] Reading logged in temperature log

**Reject-and-replace protocol:** if a container fails temperature, lid seal, or visible quality at fill — RP authorises Kitchen Manager to delay dispatch by up to 20 minutes (i.e. 05:20 cutoff). Beyond that, the container is dropped from the route and the affected DP is informed via WhatsApp **before 05:30** with reason and ETA-tomorrow.

### 3.C FILO Loading Checklist (04:30–05:00)

The driver loads the truck in **reverse-DP order**: last DP first into the bay, first DP last in. This is non-negotiable — getting this wrong wastes 10 minutes per DP unloading the wrong container.

- [ ] Load order matches the Route Sheet printed for the truck (`RouteStop.loadOrder`)
- [ ] Vehicle bay clean and dry before any container goes in
- [ ] Containers fit per vehicle layout (6 containers × 2ft dia × 3ft h; 3 folded desks; 6 water cans; 6 stools)
- [ ] Each container scanned `LOADED` (status transition `FILLED → LOADED`)
- [ ] Kit-item count per DP confirmed against master (table, umbrella, water cans, bowls, spoons, paper plates, gloves, headcaps, cups, dustbin covers)
- [ ] All kit items have visible QR / serial number
- [ ] Driver verbally briefs route (DP1 → DP2 → DP3, ETAs) — RP listens; flags if wrong
- [ ] Departure checklist (laminated, in cab) signed by driver
- [ ] Driver phone charged ≥ 80%; mobile data confirmed
- [ ] Vehicle GPS logger ON (JustDelivery confirms)
- [ ] `Route.dispatchedAt` stamped via Kitchen screen at gate-out

### 3.D Reconciliation Checklist (09:30–10:15)

The kitchen receives the truck back. Weigh-back is where wastage data is born.

- [ ] `Route.arrivedAt` stamped on truck arrival
- [ ] Each container scanned `RETURNED`
- [ ] Each container weighed back → `returnedKg` entered
- [ ] **Spillage formula sanity check (RP runs this on at least 1 container/day):**
  `returnedKg ≈ filledKg − (headcountServed × 0.400 kg)`
  If delta > 10% → log Exception with reason (over-portioning, dropped tray, no-show, etc.)
- [ ] Kit-item return count matches load-out count (per DP)
- [ ] Lost/damaged items logged in `KitItem` (`lost=true` or `damaged=true` + notes)
- [ ] Containers washed within 30 min of return (visual confirm)
- [ ] Cron-generated `Reconciliation` row (10:30) reviewed
- [ ] WhatsApp summary to ZL: units delivered / units planned / wastage % / open exceptions

---

## 4. SITE B — Truck-Follow

The RP shadows one truck end-to-end on rotation (each truck twice per week minimum). This is the only way to observe **route hygiene** — speed, deviations, container handling between DPs.

### 4.A Shadow observation (RP on two-wheeler, riding behind the truck)

Default mode is the RP riding their own two-wheeler ~20–30 m behind the truck. RP enters the cab only on rain days (§1.3 safety floor).

- [ ] Departure time matches plan (≤ 5 min slip = green, 5–15 min = amber, > 15 min = red + exception)
- [ ] Driver does not stop en route except for traffic, refuel (if planned), or emergency
- [ ] No unplanned passengers in cab
- [ ] Speed reasonable; no aggressive driving (containers shift = food spills)
- [ ] Truck stays within easy follow distance for a 2W; if driver pulls away, RP confirms next DP and meets there
- [ ] Driver receives DP-personnel ETA calls and responds calmly
- [ ] GPS dot moves on `food_app` Admin live map (RP can sanity-check from phone at any signal)
- [ ] RP wearing helmet + reflective jacket; phone mounted, not handheld

### 4.B At each DP arrival (Drop)

- [ ] Arrival time stamped (driver scans `DELIVERED`)
- [ ] DP staff is **already on site** with cleared serving area
- [ ] Container offloaded by **two people** (driver + DP staff); not dragged
- [ ] Container placed on table or clean tarp — never directly on ground
- [ ] Lid seal **intact** when offloaded — broken seal = exception, photographed
- [ ] `droppedKg`, `droppedGpsLat/Lng`, `droppedPhotoUrl` captured by driver
- [ ] DP staff acknowledges receipt verbally + by scanning on DP screen
- [ ] Driver does **not** stay to serve (unless DP is a shelter, then driver serves)

### 4.C Between DPs (transit)

- [ ] Kit items for the just-served DP do **not** go back in truck (they stay for pickup loop)
- [ ] Driver confirms next ETA over the WhatsApp group
- [ ] No unplanned route deviation

### 4.D At each DP pickup (Collect)

- [ ] Arrival 45–60 minutes after drop (target: window middle, 50 min)
- [ ] Service has **ended** before pickup (no plates being served when truck arrives)
- [ ] Container lid closed, leftovers visible & estimated
- [ ] `pickupAt`, `pickupPhotoUrl`, `headcountServed` captured
- [ ] Kit items packed: table folded, umbrella down, chairs stacked, water cans empty & rinsed, dustbin tied
- [ ] DP area swept clean of paper plates, food debris, water spills — **no trace left behind**
- [ ] Container loaded back FIFO (first dropped = first picked up)
- [ ] Container scanned `PICKED_UP`

> **Red flag triggers immediate Exception + photo:** broken seal en route, container dropped/spilled, DP staff absent at drop, service still ongoing at pickup, area not cleaned at pickup, fight/incident at DP.

---

## 5. SITE C — DP Visit (Distribution Point)

RP visits 5–6 DPs per day. ~3 of these are during the **truck-follow** (above). The remaining 2–3 are **independent visits** to the other truck's DPs, timed either during serve (06:00–07:30) or during pickup (07:30–08:30).

A DP visit is **15–25 minutes**. Long enough to watch a queue cycle.

### 5.A Pre-arrival (en route to DP)

- [ ] Confirm DP is operational today (WhatsApp roll-call done by 04:00)
- [ ] Note the planned units for today (typically 300/day for Sampark DPs)
- [ ] Carry: phone (`food_app` DP screen as observer), notebook, gloves, headcap, ID badge

### 5.B On-site observation (during serve)

**Setup quality**
- [ ] DP staff present, in apron + headcap + gloves
- [ ] Table set up correctly — level, on hard ground, not blocking footpath
- [ ] Umbrella / canopy up; provides actual shade over server and food
- [ ] Water cans full at start; cups available
- [ ] Dustbin tied, in reach of queue
- [ ] Branded signage visible (umbrella + table-front)
- [ ] Paper plates stacked clean, gloves worn for handling food
- [ ] Serving bowl (400g) being used — **not** estimating by hand

**Queue & crowd (see §6.B for full crowd-management SOP)**
- [ ] Queue line marked / understood; no scrum
- [ ] Single serving point — no side-pulls
- [ ] Children / women / elderly not displaced
- [ ] No re-serves (one plate per person per day; staff knows the rule)
- [ ] Beneficiaries leave the serve area after receiving — no clustering at the table
- [ ] Approximate beneficiary count tallies (live) with `headcountServed`

**Dignity (see §6.C for full dignity charter)**
- [ ] No raised voice from staff
- [ ] Portion is **served**, not dumped or thrown
- [ ] Plate handed over with both hands or with care
- [ ] No photography of beneficiaries by staff
- [ ] No conditional asks ("show ID", "stand here for photo")
- [ ] Beneficiaries with disabilities, elderly, pregnant women given priority without being made a spectacle

**Food**
- [ ] Spot taste-check by RP (separate plate, not from container) — taste, salt, temperature
- [ ] Temperature still warm at +90 min from fill (target ≥ 50°C at first serve, ≥ 45°C at last serve)
- [ ] Visual quality: no visible foreign matter, oil layer, mush
- [ ] Portion size by eye consistent across plates

**Hygiene**
- [ ] Server's gloves changed if visibly soiled
- [ ] Cup re-use for water? **No** — one cup per person
- [ ] Spills cleaned promptly; no puddles
- [ ] Distance from open drains / garbage ≥ 5 metres (else flag for permanent move)

### 5.C On-site observation (during pickup)

- [ ] Container resealed cleanly
- [ ] Headcount logged honestly (not rounded to planned units)
- [ ] Leftovers honest count
- [ ] Site swept; **zero litter** left
- [ ] DP staff debrief: any incidents, any shortage, any complaints?

### 5.D Voice debrief

At end of every DP visit the RP records a 60–90 second voice note (Pitstops "Voice" completionType already supports this; in `food_app` use the Exception audio capability):
- DP name, date, time
- Units served (estimate)
- Quality (good / amber / red) with reason
- One thing the DP did well
- One thing to fix tomorrow

---

## 6. Cross-cutting reviews

The RP runs four standing themes that don't fit any single site visit but must be reviewed continuously.

### 6.A Procurement audit (weekly, ~2 hrs Saturday)

Vendor risk is contractually Sampark's, but RP is our eyes. Run this every Saturday after the morning shift.

**Documents to pull (request from kitchen accounts):**
- [ ] Last 7 days' supplier bills (rice, dal, oil, vegetables, fuel, paper plates)
- [ ] Vendor master list (top 5 suppliers + alternates)
- [ ] Stock register (opening + receipts + consumption + closing)

**Checks:**
- [ ] Rate sanity — pick 3 items, compare to APMC mandi rate of that day (±15% green, 15–25% amber, > 25% red)
- [ ] Same-supplier concentration — no single supplier > 70% of any commodity over 7 days
- [ ] No bills > ₹50,000 cash (compliance)
- [ ] Stock-out near-miss count — how many items hit < 1-day buffer in the week?
- [ ] FSSAI numbers of suppliers logged at least once per supplier

**Reject criteria for vegetable / rice / dal lot at GRN (Goods Receipt):**
- Rice: > 2% broken, visible weevils, off-smell
- Dal: > 3% impurity, weevils
- Oil: turbid, off-smell, dark colour (not freshly transparent)
- Vegetables: > 10% rot/wilt, foul smell, water-logged
- Any item past visible "fresh" window — return at supplier cost

### 6.B Crowd management protocol (every DP, every day)

Lesson from Peenya pilot: **fixed unit cap + visible queue = order; ambiguity = chaos.**

**Pre-conditions before serving begins:**
- [ ] Today's unit cap chalked / signed at DP entry ("Today: 300 plates")
- [ ] Queue line marked with rope / chalk / cones
- [ ] Two clear paths: **queue-in** and **served-exit** (do not cross)
- [ ] Server stands behind table; no one else behind the table
- [ ] DP staff (helper) at queue head manages "next please"

**During service:**
- [ ] One plate per person, no re-serve
- [ ] Children: served by parent's plate count (not their own queue place)
- [ ] Disputes: server pauses serving until queue resolves; no shouting
- [ ] If crowd exceeds planned units within first 20 min → **announce close-time** loudly; serve remaining + close. **Do not reduce portion size to stretch supply** — that breaks the dignity charter.

**Cut-off:**
- [ ] At planned-units exhaustion or 60 min (whichever first) → close visibly, no exceptions
- [ ] Apologise to anyone in queue; tell them tomorrow's time
- [ ] Log shortage in Exception (size, location, reason)

**Escalation:** any incident involving physical altercation, police involvement, allegations of bias / discrimination, food being thrown / refused — **immediately** call ZL + record voice note + photo of site (not faces).

### 6.C Dignity-in-serving charter

Beneficiaries are **guests**, not subjects. The following are **never** acceptable and the RP corrects on-site if observed:

| Behaviour | Why it breaks dignity | Corrective action |
|---|---|---|
| Server raises voice / scolds | Public shaming | RP intervenes, completes shift, debrief at end |
| Plate thrown / dropped onto table for the beneficiary to pick up | Treats food as charity, not service | Re-train DP staff same day; report |
| Photography of beneficiary faces | Consent violation; can become evidence in police case against beneficiary | Confiscate, delete, brief staff and driver |
| Asking for ID, ration card, or proof | Programme is unconditional | Stop immediately; brief staff |
| Conditional serving ("only if you stand here", "only if children come too") | Conditional charity | Stop; reset queue rule |
| Serving family members / friends ahead of queue | Favouritism | Mark in Exception; if repeated, request DP-staff change |
| Different portion sizes based on appearance | Discrimination | Use the 400g bowl, every time |
| Visible disgust at beneficiary | Demeaning | Re-train; if repeated, replace DP staff |

**Positive markers the RP should also log (we learn from these too):**
- Server greets beneficiaries
- Server thanks beneficiaries at handover
- DP staff helps elderly / disabled / pregnant women without asking
- DP staff cleans without being asked

### 6.D Food safety & temperature SOP

**Calibration & equipment (weekly, RP supervises):**
- [ ] Thermometer ice-point check (0°C ± 1°C in slush)
- [ ] Container temperature retention test: full container at 75°C → reading at +3 hrs should still be ≥ 50°C. Containers failing this → off-route to repair.
- [ ] Kitchen scale tare-check with 1 kg weight
- [ ] Vehicle bay surface clean & dry

**Daily temperature record:**
- [ ] Cook-line final-product temperature ≥ 75°C (3 random readings)
- [ ] Container core temperature at fill ≥ 65°C
- [ ] Container core temperature at last-DP first-serve target ≥ 50°C (random sample)

**Holding-time hard cap:** no served food may be > 5 hours from time-of-cook. With dispatch at 05:00 and last serve ~08:00 we are comfortably inside this. Any delay pushing service past 09:00 → that container's serve is **cancelled**, not extended.

### 6.E Wastage & portion governance (monthly)

Inputs: `Reconciliation` rows for the month, `Delivery.returnedKg`, `Delivery.headcountServed`.

Outputs (RP draws each month):
- Per-DP wastage rate = `Σ returnedKg / Σ filledKg`
- Per-DP no-show rate = `Σ (plannedUnits − headcountServed) / Σ plannedUnits`
- Per-DP shortage incidents = count of days `headcountServed = plannedUnits` (i.e. ran out)

**Recommendations the RP files monthly:**
- Per-DP planned-units adjustment (up if shortage > 2 days/month, down if wastage > 15%)
- Portion-size review (only ZL approves an actual change to 400g)
- DP-time-window review (if early-arrivers overwhelm, push DP serve-start by 15 min)

This feeds the existing Pitstops **"Food Distribution — Monthly Operations Review"** template directly.

---

## 7. Exceptions & escalation matrix

| Situation | Stamp in `food_app` | Notify within | To whom |
|---|---|---|---|
| Kitchen not ready by 04:30 | Exception (Kitchen) | 04:35 | Kitchen Manager + ZL |
| Container fails temperature/seal at fill | Exception | Immediate | Kitchen Manager, decision: hold up to 20 min or drop container |
| Truck dispatch delay > 15 min | Exception (Driver) | At 05:15 | DP WhatsApp group + ZL |
| Vehicle breakdown en route | Exception | Immediate | JustDelivery (driver direct line) + RP + ZL |
| DP staff absent at drop | Exception | Immediate | Sampark coordinator + ZL |
| Broken seal / spillage en route | Exception + photo | Immediate | ZL |
| Crowd incident (no physical) | Voice note + Exception | Same day | ZL |
| Physical altercation / police involved | Photo + voice + call | **Immediate phone call** | ZL **and** programme lead, **before** continuing day |
| Allegation of discrimination / bias | Voice + Exception | Same day | ZL + dignity-charter review |
| Suspected food-poisoning report from any beneficiary | Photo + call | **Immediate phone call** | ZL, programme lead, and Ramani Manager. Pause that DP next day pending review. |
| Shortage (ran out before 30 min) | Exception | Same day | ZL — feeds units-planned review |
| FSSAI / pest log not signed | Exception | Same day | Kitchen Manager + monthly review |
| Vendor bill anomaly / single-supplier spike | Voice note | Within week | Programme lead |
| Two consecutive monthly SLA breaches by Ramani | Goal in Pitstops | Within 7 days | Programme lead — triggers contract review |

> **Phone-call escalations are required (not WhatsApp) for:** suspected food-poisoning, physical altercation, police involvement, vehicle accident with injury.

---

## 8. Reporting cadence

| Cadence | What | Where | Who |
|---|---|---|---|
| Daily 10:45 | One-line WhatsApp: `units delivered / planned, wastage %, open exceptions, anything red` | ZL WhatsApp | RP |
| Daily auto 10:30 | `Reconciliation` row | `food_app` DB | Cron |
| Weekly Sat 11:00 | Procurement audit notes (§6.A) | Pitstops checklist item under monthly goal | RP |
| Weekly Sun 18:00 | DP-by-DP heatmap (units, wastage, incidents) | Shared sheet | RP |
| Monthly (last working day) | MIS + grant utilisation + RP narrative | Pitstops "Monthly Operations Review" template | RP + ZL |
| Quarterly | Sampark + Ramani joint review | Meeting | Programme lead |

**RP narrative — five-line max for monthly:** what improved, what regressed, one decision needed from ZL, one thing to celebrate at a DP, one risk.

---

## 9. Implementation phasing (RP onboarding, Weeks 1–4)

This is what we do **with** the RP in their first month. After Week 4 they run independently and this doc is reference, not training.

### Week 1 — Shadow

- Day 1–2: shadow the existing Kurubarahalli RP through the full shift (kitchen → truck → DP → reconciliation)
- Day 3–4: RP runs §3.A and §3.B (kitchen only) under supervision
- Day 5–7: RP joins truck-follow but does not lead; observes the route

**Pitstops:** seed a one-time "RP Onboarding — Week 1 Shadow" goal with these days as checklist items.

### Week 2 — Co-pilot

- Day 8–10: RP runs §3 (kitchen end-to-end) alone; supervisor checks evening
- Day 11–14: RP runs §4 (truck-follow) alone; covers each truck twice
- Day 14: first solo Daily Wrap WhatsApp report

**Pitstops:** "RP Onboarding — Week 2 Co-pilot" goal.

### Week 3 — Solo with safety net

- Day 15–21: full §2 timeline, RP solo
- ZL spot-checks two DPs per week unannounced
- End of Week 3: 30-minute review meeting — RP shares what surprised them

### Week 4 — Steady state

- Day 22–28: standard ops
- End of Week 4: first **independent §6.A procurement audit** and §6.E wastage cut
- Monthly Pitstops "Food Distribution — Monthly Operations Review" goal opens automatically

### What we still need to build in Pitstops

| Artefact | Type | Frequency | Status |
|---|---|---|---|
| Daily Kitchen Audit (§3.A + 3.B + 3.C) | Pitstop template, recurrence Daily | Daily | **Not yet seeded** — proposed |
| Daily Truck-Follow + DP Rounds (§4 + §5) | Pitstop template, recurrence Daily | Daily | **Not yet seeded** — proposed |
| Weekly Procurement Audit (§6.A) | Pitstop template, recurrence Weekly | Weekly | **Not yet seeded** — proposed |
| Monthly Operations Review | `GoalTemplateDef` | Monthly | ✅ Exists (`food-distribution-monthly`) |
| New DP Activation | `GoalTemplateDef` | Ad-hoc | ✅ Exists (`food-distribution-new-dp`) |
| Launch & Operationalisation | `GoalTemplateDef` | One-time | ✅ Exists (`food-distribution-launch`) |
| Dignity Charter quick-reference card (printable) | Asset under `public/` | One-time | **Not yet built** — proposed |

> Before we seed daily templates we should decide: do daily field tasks belong as Pitstops (which will create 30 checklist instances per month), or are they better tracked entirely inside `food_app` (where they're already partly modelled as `ContainerEvent` and `Exception`)? Recommendation: **use `food_app` for the per-container operational truth and seed Pitstops only with the daily "RP morning audit completed?" gate + voice debrief** — avoids double-bookkeeping.

---

## 10. Mapping to `food_app` (where each check lives)

| Manual check | `food_app` representation |
|---|---|
| Container filled & weighed | `Delivery.filledKg`, `filledAt`, `filledPhotoUrl`; `Container.status = FILLED`; `ContainerEvent type=FILLED` |
| FILO loading | `Container.status = LOADED`; `Route.dispatchedAt` |
| Drop at DP | `Delivery.droppedKg`, `droppedAt`, `droppedGpsLat/Lng`, `droppedPhotoUrl`; status `DELIVERED` |
| Pickup at DP | `Delivery.pickupAt`, `pickupPhotoUrl`, `headcountServed`; `Container.status = PICKED_UP` |
| Weigh-back at kitchen | `Delivery.returnedKg`, `returnedAt`; status `RETURNED` |
| Any incident (broken seal, fight, shortage, late) | `Exception` (audio + transcript + translation) |
| Lost / damaged kit | `KitItem.lost`, `KitItem.damaged`, `notes` |
| End-of-day truth | `Reconciliation` (auto cron 10:30) |

**RP screens / actions to add to `food_app` (proposed, not yet built):**
- Manager-role "Daily Audit" tab with the §3.A checklist as toggle-state, persisted per `Route.date`
- Quick-Exception button on each DP card during the day (one tap → audio capture)
- Temperature spot-check field on the Kitchen "mark-filled" form (currently only weight + photo)

---

## 11. Role-by-role daily breakdown

The SOP is structured around the **RP**, but the RP only observes — they don't do the work. The work is done by 14 distinct roles whose ratios are encoded in `lib/budget-costs.ts` and used by Pitstops to compute the budget for any scale.

This section is the answer to "what does each person do at each hour of the day?" Read it together with §12 (ratios & cost registry) and the **Staffing model** sheet in the effort calculator XLSX.

> **Convention.** Counts scale linearly with `meals_per_day` for kitchen roles, with `nTrucks` for transport, and with `nDPs` for distribution. Coordinators are fixed. The day below describes one *person* of that role at any scale — multiply by headcount.

### 11.1 Central / coordination team (3 fixed roles, office-anchored)

#### 11.1.1 Programme Coordinator — `food.programme_coordinator_salary` ₹65,000/mo

Stewards the programme: donor reporting, partner relationships, growth plan, hiring sign-off. Not on the operations floor daily.

| Time | Activity |
|---|---|
| 09:00 – 09:30 | Read overnight Reconciliation row + RP's 10:45 WhatsApp summary; flag anything red |
| 09:30 – 11:00 | Standing meetings (Sampark / CFAR / Ramani as cadence) |
| 11:00 – 13:00 | Donor reporting, MIS review, grant utilisation tracking |
| 13:00 – 14:00 | Lunch / off-clock |
| 14:00 – 16:00 | Growth planning, new-DP pipeline, partner-onboarding |
| 16:00 – 17:30 | Issue review with RP + ZL; next-day priority calls |
| 17:30 – 18:00 | End-of-day wrap, escalations to Foundation lead |

**Active hours/day: ~8.** Not part of the dawn shift.

#### 11.1.2 Procurement Coordinator — `food.procurement_coordinator_salary` ₹50,000/mo

Owns raw-material flow into the kitchen. Split shift, because mandi buying happens at dawn and supplier reconciliation happens during business hours.

| Time | Activity |
|---|---|
| 04:00 – 08:00 | At kitchen GRN bay: receive deliveries, supervise quality checks against §6.A reject criteria, sign off bills |
| 08:00 – 09:30 | Update stock register, reconcile yesterday's consumption |
| 09:30 – 13:00 | Supplier calls — next-day order placement, rate negotiation, payment clearance |
| 13:00 – 14:00 | Lunch / break |
| 14:00 – 17:00 | Vendor visits, alternate-supplier scouting, monthly contract review |
| 17:00 – 18:00 | Place next-day order, brief Kitchen Manager on tomorrow's menu and any shortages |

**Active hours/day: ~10 (split).** Off-day rotates with backup.

#### 11.1.3 Delivery Coordinator — `food.delivery_coordinator_salary` ₹30,000/mo

Owns the truck fleet end-to-end: GPS monitoring, driver roster, JustDelivery interface, exception triage.

| Time | Activity |
|---|---|
| 04:30 – 05:00 | At kitchen during loading — confirms FILO order, GPS active on each truck |
| 05:00 – 08:00 | At dispatch desk monitoring live map; takes driver calls; brokers escalation to JustDelivery if needed |
| 08:00 – 10:00 | Tracks pickup loop; resolves any pickup exceptions |
| 10:00 – 10:30 | Witnesses truck arrival; closes the Route for the day |
| 10:30 – 12:30 | Reconciliation review, kit loss/damage logging, next-day rota for drivers |
| 12:30 – 13:30 | Vehicle maintenance scheduling, JustDelivery weekly review |

**Active hours/day: ~9.**

### 11.2 Kitchen team (scales with `meals_per_day`)

The kitchen runs on a single early-morning peak: every role times their shift to hit the 04:30 readiness gate.

#### 11.2.1 Kitchen Manager — 1 per 10,000 meals/day, `food.kitchen_manager_salary` ₹55,000/mo

The single accountable person at the kitchen during the cook + dispatch window.

| Time | Activity |
|---|---|
| 01:30 – 02:00 | Arrive; opening walk — fire, gas, water, pest log signed |
| 02:00 – 04:00 | Cook-line supervision; menu adherence; manpower deployment; corrective action |
| 04:00 – 04:30 | **Fill quality control** — every container weighed, temperature checked, sealed (with RP) |
| 04:30 – 05:00 | **FILO loading supervision**; clears the truck for dispatch |
| 05:00 – 07:00 | Cleanup oversight; staff debrief; raw-material indent for tomorrow |
| 07:00 – 10:00 | Vendor calls, training, MIS, walkthrough audits, attendance |
| 10:00 – 10:30 | Returned-container weigh-back oversight |

**Active hours/day: ~9.** This is a senior, single-point-of-failure role — backup must be named.

#### 11.2.2 Warehouse Manager — 1 per 10,000 meals/day, `food.warehouse_manager_salary` ₹40,000/mo

Custodian of dry store and cold store. Hands raw material to the cook line at 02:00.

| Time | Activity |
|---|---|
| 01:30 – 02:00 | Open dry store; issue today's allotment to cook line per BOM |
| 02:00 – 04:00 | Supervise cook-line uptake; manage substitutions if shortage |
| 04:00 – 06:00 | Receive overnight-delivered vegetables; sort, store, log |
| 06:00 – 09:00 | Receive bulk deliveries (rice, dal, oil); GRN; stock register update |
| 09:00 – 10:00 | Cold-chain inventory check; expiry sweep |
| 10:00 – 10:30 | Hand over to next shift if 2-shift kitchen |

**Active hours/day: ~8–9.**

#### 11.2.3 Cook — 6 per 10,000 meals/day (1 cook : 1,667 meals), `food.cook_salary` ₹50,000/mo

Production lead. Owns the rice/dal/sabzi station.

| Time | Activity |
|---|---|
| 01:00 – 01:30 | Arrive; receive raw materials from Warehouse Manager |
| 01:30 – 02:00 | Fire-up; oil + tempering setup |
| 02:00 – 04:00 | Cook (main course, rice, side) |
| 04:00 – 04:30 | Transfer to insulated containers; temperature confirm |
| 04:30 – 05:00 | Clean station; off-duty |

**Active hours/day: ~4.5.** Heavy physical work; often gets a half-day off rotation.

#### 11.2.4 Helper Cook — 9 per 10,000 meals/day (1 : 1,112), `food.helper_cook_salary` ₹25,000/mo

Supports the Cook: pre-prep, station running, condiments.

| Time | Activity |
|---|---|
| 00:30 – 01:00 | Arrive; final chopping handover from night-shift Chopping & Cleaning |
| 01:00 – 02:00 | Set up the cook's station; bring raw material to range |
| 02:00 – 04:00 | Active assist during cooking; oil top-up, stir, transfer |
| 04:00 – 04:30 | Container fill assistance; lid sealing |
| 04:30 – 05:00 | Cook-line cleanup |

**Active hours/day: ~4.5.**

#### 11.2.5 Kitchen Loader — 6 per 10,000 meals/day (1 : 1,667), `food.kitchen_loader_salary` ₹25,000/mo

Moves filled containers from cook line to staging to truck.

| Time | Activity |
|---|---|
| 04:00 – 04:30 | Pull containers from cook line to staging area; weigh-station |
| 04:30 – 05:00 | **FILO truck loading** — last-DP-first into bay |
| 05:00 – 09:30 | Off-duty (or stand-by) |
| 09:30 – 10:15 | Unload returned containers; stage for wash |

**Active hours/day: ~2–3** (with a long unpaid gap; many kitchens schedule a second task in this window, e.g. utensil cleaning).

#### 11.2.6 Chopping & Cleaning — 15 per 10,000 meals/day (1 : 667), `food.chopping_cleaning_salary` ₹20,000/mo

Night shift. Preps the next day's vegetables, dal, rice — so the Cook can start at 02:00 on raw material that's ready.

| Time | Activity |
|---|---|
| 21:00 – 22:00 | Receive evening vegetable delivery; sort |
| 22:00 – 00:00 | Wash, peel, chop |
| 00:00 – 01:00 | Dal washing + soaking; rice sorting; spice paste prep |
| 01:00 – 02:00 | Final handover to Helper Cook |
| 02:00 – 05:00 | Pot wash, vessel scrub for next cycle |

**Active hours/day: ~8.** Night shift premium typically built into the ₹20k; track separately if you split AM/PM cleaners.

#### 11.2.7 Food Loader — 15 per 10,000 meals/day (1 : 667), `food.food_loader_salary` ₹18,000/mo

Heavy-lift floor staff. Containers are heavy (50–300 units of cooked food) — multiple loaders per truck.

| Time | Activity |
|---|---|
| 04:00 – 04:30 | Move staged containers to truck bay |
| 04:30 – 05:00 | Load truck (with Kitchen Loader, in FILO order) |
| 09:30 – 10:15 | Unload returned containers; carry to weigh-back |

**Active hours/day: ~2–4** (similar split-day pattern as Kitchen Loader).

#### 11.2.8 Housekeeping — 15 per 10,000 meals/day (1 : 667), `food.housekeeping_salary` ₹15,000/mo

Cleans cook-line floors, drains, washrooms, vehicle bay. Not food-handling.

| Time | Activity |
|---|---|
| 05:00 – 07:00 | Deep-clean cook line, floors, drains |
| 07:00 – 09:00 | Vessels station + washroom clean |
| 09:00 – 11:00 | Vehicle bay + outer premises; garbage clearance |
| 11:00 – 13:00 | Pest-control routine; soap/sanitizer refill |

**Active hours/day: ~8.**

### 11.3 Transport team (scales with `nTrucks`)

#### 11.3.1 Truck Driver — 1 per truck (rolled into `food.truck_cost_per_month` ₹53,100/truck/mo)

The ₹53,100 covers driver + fuel + maintenance + vehicle rental as a JustDelivery all-in. Driver salary component is ~₹25,000.

| Time | Activity |
|---|---|
| 04:15 – 04:30 | Arrive at kitchen; vehicle inspection (oil, water, tyre, GPS) |
| 04:30 – 05:00 | Witness FILO load; sign load sheet |
| 05:00 – 05:30 | Dispatch + drive to DP 1 |
| 05:30 – 06:30 | DP 1 → DP 2 → DP 3 drop loop |
| 06:30 – 07:30 | Hold at base (DP 3 area) — fuel break, breakfast, vehicle wipe |
| 07:30 – 08:30 | DP 1 → DP 2 → DP 3 pickup loop |
| 08:30 – 10:00 | Return to kitchen |
| 10:00 – 10:30 | Sign off, wash truck, hand over keys |

**Active hours/day: ~5.5.** Light enough that JustDelivery sometimes runs a second school-feeding shift on the same vehicle in the afternoon — confirm explicitly with JustDelivery on contract, since it affects daytime availability for emergency rerun.

### 11.4 DP team (scales with `nDPs`, 2 staff per DP)

#### 11.4.1 DP Staff — 2 per DP (`food.dp_staff_per_dp`), `food.dp_staff_remuneration_per_month` ₹6,000/staff/mo

Part-time. Two staff per DP — one server, one queue-helper. Typically 3 hours of paid work per day, hence the ₹6,000/mo (~₹40/hr at 6-day week).

| Time | Activity |
|---|---|
| 05:00 – 05:30 | Arrive at DP; sweep area; set up table, umbrella, water can, dustbin, plate stack |
| 05:30 – 06:00 | Receive container from driver; sign delivery; final pre-serve check |
| 06:00 – 07:00 | Serve (one staff at bowl, one at queue head) |
| 07:00 – 07:30 | Tail-end serving + closure announcement |
| 07:30 – 08:00 | Pack kit; container ready for pickup; sweep area clean |
| 08:00 – 08:15 | Hand over to driver during pickup loop |

**Active hours/day: ~3 (per staff).**
**Total per DP: 6 person-hours/day.**

### 11.5 Resource Person (RP) — see §2 for full detail

| Block | Hours |
|---|---|
| Kitchen morning | 2.5 |
| Filling + FILO + dispatch | 0.5 |
| Truck-follow | 2.5 |
| Independent DP rounds | 2.0 |
| Reconciliation + daily wrap | 1.5 |
| **Total** | **9** |

RP headcount comes from the **RP Effort Calculator** section of the XLSX, not the Staffing Model section — keep them separate even though both feed the same monthly budget.

### 11.6 Per-shift person-hour rollup (illustrative @ 1,500 meals, 5 DPs, 2 trucks)

| Role | Headcount | Hrs/person | Person-hrs/day |
|---|---|---|---|
| Programme Coordinator | 1 | 8 | 8 |
| Procurement Coordinator | 1 | 10 | 10 |
| Delivery Coordinator | 1 | 9 | 9 |
| Kitchen Manager | 1 | 9 | 9 |
| Warehouse Manager | 1 | 8 | 8 |
| Cook | 1 | 4.5 | 4.5 |
| Helper Cook | 2 | 4.5 | 9 |
| Kitchen Loader | 1 | 3 | 3 |
| Chopping & Cleaning | 3 | 8 | 24 |
| Food Loader | 3 | 4 | 12 |
| Housekeeping | 3 | 8 | 24 |
| Truck Driver | 2 | 5.5 | 11 |
| DP Staff | 10 (5 DPs × 2) | 3 | 30 |
| RP | 1 (from calculator) | 9 | 9 |
| **Total** | **31** | — | **~170 person-hrs/day** |

Each row is reproduced live in the **Staffing model** sheet of the XLSX — change `meals_per_day` and every count + cost recomputes.

---

## 12. Ratios & cost registry (source: `lib/budget-costs.ts`)

These are the canonical figures Pitstops uses in the budget builder. Treat this section as a reference; do not memorize.

### 12.1 Headcount ratios

| Role | Ratio | Notes |
|---|---|---|
| Programme / Procurement / Delivery Coordinator | 1 each, fixed | Independent of scale up to ~25k meals/day. Above that, review. |
| Kitchen Manager | 1 per **10,000** meals/day | `food.meals_per_kitchen_manager` |
| Warehouse Manager | 1 per **10,000** meals/day | `food.meals_per_warehouse_manager` |
| Cook | 1 per **1,667** meals/day (6 per 10k) | `food.meals_per_cook` |
| Helper Cook | 1 per **1,112** meals/day (9 per 10k) | `food.meals_per_helper_cook` |
| Kitchen Loader | 1 per **1,667** meals/day (6 per 10k) | `food.meals_per_kitchen_loader` |
| Chopping & Cleaning | 1 per **667** meals/day (15 per 10k) | `food.meals_per_chopping_cleaning` |
| Food Loader | 1 per **667** meals/day (15 per 10k) | `food.meals_per_food_loader` |
| Housekeeping | 1 per **667** meals/day (15 per 10k) | `food.meals_per_housekeeping` |
| Truck Driver | 1 per truck | Rolled into `food.truck_cost_per_month` |
| DP Staff | 2 per DP | `food.dp_staff_per_dp` |
| RP | Computed by §1.2 coverage rules | See effort calculator |

### 12.2 Monthly salary registry

| Role | Salary | Cost key |
|---|---|---|
| Programme Coordinator | ₹65,000 | `food.programme_coordinator_salary` |
| Procurement Coordinator | ₹50,000 | `food.procurement_coordinator_salary` |
| Delivery Coordinator | ₹30,000 | `food.delivery_coordinator_salary` |
| Kitchen Manager | ₹55,000 | `food.kitchen_manager_salary` |
| Warehouse Manager | ₹40,000 | `food.warehouse_manager_salary` |
| Cook | ₹50,000 | `food.cook_salary` |
| Helper Cook | ₹25,000 | `food.helper_cook_salary` |
| Kitchen Loader | ₹25,000 | `food.kitchen_loader_salary` |
| Chopping & Cleaning | ₹20,000 | `food.chopping_cleaning_salary` |
| Food Loader | ₹18,000 | `food.food_loader_salary` |
| Housekeeping | ₹15,000 | `food.housekeeping_salary` |
| DP Staff (per staff) | ₹6,000 | `food.dp_staff_remuneration_per_month` |
| Truck (all-in: driver+fuel+maintenance+rental) | ₹53,100 | `food.truck_cost_per_month` |
| RP (salary only) | ₹50,000 | Effort calculator input `rp_salary_pm` |

### 12.3 Kitchen utility costs (per kitchen, flat)

| Item | Cost | Cost key |
|---|---|---|
| Electricity | ₹75,000/mo | `food.electricity_per_month` |
| Water bill | ₹40,000/mo | `food.water_bill_per_month` |
| Cleaning | ₹60,000/mo | `food.cleaning_per_month` |
| Gas | ₹85,000/mo | `food.gas_per_month` |
| Maintenance | ₹50,000/mo | `food.maintenance_per_month` |

These are flat regardless of meal volume (within the 10–20k meals/day range) — change only if a new kitchen comes online.

### 12.4 DP consumables (per DP, monthly)

| Item | Unit cost | Rate | Cost keys |
|---|---|---|---|
| Paper plates | ₹1.30 each | per meal | `food.paper_plate_cost` |
| Dustbin covers | ₹10/cover | 50/DP/mo | `food.dustbin_cover_cost` × `food.dustbin_covers_per_dp_per_month` |
| Gloves | ₹5/pair | 100/DP/mo | `food.gloves_cost` × `food.gloves_per_dp_per_month` |
| Head caps | ₹2/cap | 50/DP/mo | `food.head_cap_cost` × `food.head_caps_per_dp_per_month` |
| Drinking water cans | ₹30/can | 50/DP/mo | `food.drinking_water_can_cost` × `food.drinking_water_cans_per_dp_per_month` |
| Aprons | ₹500 each | 2/DP/year | `food.apron_cost` × `food.aprons_per_dp_per_year` |
| Misc DP supplies | ₹2,000/DP/mo | flat | `food.misc_per_dp_per_month` |

### 12.5 One-time DP capex

| Item | Cost | Cost key |
|---|---|---|
| Foldable table | ₹6,000/DP | `food.foldable_table_per_dp` |
| Canopy tent | ₹8,000/DP | `food.canopy_tent_per_dp` |
| Standee umbrella | ₹2,000/DP | `food.standee_umbrella_per_dp` |
| Water containers (2 per DP) | ₹250 × 2 = ₹500/DP | `food.water_container_cost` × `food.water_containers_per_dp` |
| Serving kit (per kitchen) | ₹85,000 | `food.serving_kit_per_kitchen` |
| Kitchen equipment (in-house only) | varies | `food.kitchen_equipment_one_time` (0 for vendor-procured) |

### 12.6 Food cost

| Item | Cost | Notes |
|---|---|---|
| Ramani (Sampark side) | ₹29.40/meal | Vendor-procured |
| Wipro Canteen (CFAR side) | ₹20.00/meal | Vendor-procured |
| Reference vegetarian cost-per-meal | ₹21.91/meal | `food.cost_per_meal` — weekly avg ₹153.36 ÷ 7 days |

**Whenever any of these numbers change in `lib/budget-costs.ts`, the effort calculator must be re-run.** The XLSX hard-codes them as inputs on the Staffing model sheet; re-rerun the build script with the new values and update Annexure A as needed.

---

## Annexure A — Effort Calculator (XLSX)

The companion XLSX `docs/food-programme-rp-effort-calculator.xlsx` has **five sheets**:

| Sheet | Purpose |
|---|---|
| Calculator | RP-only sizing (the one §1.2 covers) |
| Scenarios | Three pre-loaded comparisons (Launch / Mid-scale / Full Ramani) |
| Staffing model | **All 14 roles** with headcount, hours/day, person-hours/day, monthly cost — driven by `meals_per_day`, `nTrucks`, `nDPs` |
| Cost registry | Mirror of `lib/budget-costs.ts` `food.*` entries — single source of unit costs |
| Assumptions | What every input means, why, when to re-run |

Re-run the calculator whenever any of these inputs change:

- Meals/day (total)
- Number of kitchens
- Meals/truck/day (current TATA Ace assumption: ~750)
- Meals/DP/day (default 300, editable)
- DP-visits/DP/week (default 2)
- RP working days/week (default 6)
- Rain-buffer factor (default 1.10 — adds 10% cab/replacement-RP headroom)

The sheet returns:

- Trucks required (= ceil(meals ÷ meals-per-truck))
- DPs required (= ceil(meals ÷ meals-per-DP))
- DP-visits/week required (= DPs × visits/DP/week)
- DP-visit capacity per RP per week (= 6 DPs/day × working days)
- Kitchen-RPs (= one per kitchen — single-kitchen mornings are not parallelisable)
- Field-RPs (= ceil(DP-visit requirement ÷ per-RP capacity), minus kitchen-RP overlap)
- **Total RPs** (= max of the above, × rain-buffer)
- Monthly RP cost — salary + two-wheeler allowance + night cab + buffer cabs

Three pre-loaded scenarios for orientation: **Launch (1.5k meals)**, **Mid-scale (5k meals)**, **Full Ramani (20k meals, 60 DPs)**. Add scenarios as columns; do not overwrite the originals.

**DP-to-truck mapping is per-deployment** — record it in `DistributionPoint.homeTruck` / `DistributionPoint.routeOrder` in the `food_app` DB, not in this doc. The SOP does not care which DP-name maps to which truck; it cares only that coverage and rotation rules hold.

## Annexure B — Quick-reference: RP "what to carry" kit

- Phone with `food_app` logged in (Manager role)
- Power-bank, ≥ 10,000 mAh
- **Helmet + reflective jacket** (two-wheeler safety)
- **Phone mount on the two-wheeler** (no handheld navigation)
- Two-wheeler RC, DL, insurance copy (mandatory carry)
- Cab-booking app installed, programme account active (for night leg + fallback)
- Pocket notebook + pen
- Probe thermometer (calibrated; second one as backup)
- Pocket weighing scale (digital, 5 kg cap.) — for spot-check of a single plate
- ID badge + RP visiting cards (for DP staff to hand to local authority on enquiry)
- Bottle of drinking water + ORS sachets
- Hand sanitiser
- Two spare gloves + headcap (for own use when entering cook line or at DP)
- Light raincoat / poncho (monsoon months)
- Laminated copy of: §3.A, §4.B/D, §5.B, §6.C dignity charter, §7 escalation matrix

## Annexure C — Glossary

- **DP** — Distribution Point (the hotspot where food is served)
- **Drop → Serve → Collect** — the kit-based model: truck drops sealed kit, DP serves, truck collects empties + kit
- **FILO** — First-In Last-Out (loading order: last DP's container loaded first so it can be unloaded last)
- **GRN** — Goods Receipt Note (used in §6.A procurement reject criteria)
- **`food_app`** — the companion ops app under `~/food_app` (Next.js, Postgres, role-based for Kitchen/Driver/DP/Manager)
- **Reconciliation** — auto-generated daily snapshot of planned vs delivered units, generated by Vercel cron at 10:30 AM
- **Pitstop / Pitstops** — the planning + accountability tool (this repo) where strategic goals and recurring checklists live
- **ZL** — Zonal Lead (RP's direct escalation)

---

*Version 1 · 2026-05-29 · Owner: Programme Lead · Reviewer: RP, ZL, Sampark coordinator*
