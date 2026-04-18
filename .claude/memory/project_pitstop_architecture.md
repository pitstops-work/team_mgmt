---
name: Pitstop app — map/assessment/FC architecture
description: Core architectural principle: assessment form is source of truth; map has edit buttons to it; FC is a dashboard aggregation
type: project
---

Assessment form is the basis for everything. Always.

- **Assessment form** (`/needs/settlement/[id]`) = single source of truth for all on-ground data (population, existing facilities, programme need)
- **Field Coverage** (`/needs`) = dashboard aggregation of assessment data, never hardcoded
- **Map** = visual layer; every feature has an Edit button that links to the relevant assessment form

Map edit button targets:
- Settlement → `/needs/settlement/[id]` (settlement assessment)
- Cluster → `/needs?clusterId=X` (Field Coverage filtered to cluster)
- Zone → `/needs?zoneId=X` (Field Coverage filtered to zone)
- Children Centre / Youth Centre / Creche / Elderly → `/needs/settlement/[matched_settlement_id]` (the settlement that hosts the centre)

Drawing on map → creates DB entry → opens assessment form to fill in details.

**Why:** This is the stated architectural direction. All future features should respect this hierarchy.
**How to apply:** When adding any data flow for field data, trace it back to SettlementAssessment as the origin. Never hardcode FC values.
