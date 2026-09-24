# Screening intake API

How the application portal sends applications to the screening portal (`/seeding/screening`).

## Endpoint

```
POST /api/seeding/screening/intake
Authorization: Bearer <SCREENING_INTAKE_TOKEN>
Content-Type: application/json
```

`SCREENING_INTAKE_TOKEN` is an environment variable on the Pitstop deployment. Share it with the portal team outside email.

The body is one application, or `{ "applications": [ ... ] }` with up to 100 applications.

## Application

| Field | Required | Notes |
|---|---|---|
| `ref` | yes | The portal's application reference. Sending the same `ref` again updates the application. |
| `email` | yes | Stored lower-case. |
| `name` | yes | |
| `phone` | | |
| `geography` | | `bangalore_urban`, `eastern_up`, `odisha`, `north_east`, or their labels. Anything else is stored as Unassigned. |
| `state`, `district`, `block` | | District is used to scope screeners. |
| `theme` | | As shown to the applicant. |
| `isGroup` | | `true` for group applications. Also true if `members` is not empty. |
| `submittedAt` | | ISO date. |
| `profile` | | Structured form answers as `{ "Question label": value }`. Shown to reviewers as sent. |
| `answers` | | Written answers: `[{ "key": "e1", "label": "What motivates you…", "text": "…" }]`. |
| `statementOfPurpose` | | Text. Alternatively send it as a document with `kind: "sop"`. |
| `members` | | Group members, entered by the primary applicant: `[{ "Name": "…", … }]`. |
| `criteriaFlags` | | Stated criteria the applicant is below: `[{ "criterion": "Under 40 on the closing date", "detail": "41 years 2 months" }]`. |
| `documents` | | `[{ "kind": "cv", "name": "cv.pdf", "url": "https://…" }]`. Kinds: `cv`, `sop`, `photo`, `class10`, `degree`, `experience`, `other`. URLs must be https and readable by the Pitstop server. PDF and DOCX are read; images are only linked. |

Send the whole application each time. An update replaces every field sent before.

## Responses

`200` if every application was accepted, `207` if some were, `400` if none were. The body always lists each application:

```json
{ "results": [ { "ref": "APP-0142", "ok": true, "created": true },
               { "ref": "APP-0143", "ok": false, "error": "APP-0143: a valid email is required" } ] }
```

`401` means the token is wrong or not set.

## After intake

- A new application goes into the geography's queue as **Awaiting L2**.
- If first reads are switched on in Settings, Claude drafts scores within a few minutes.
- An update to an application nobody has reviewed yet is drafted again. An update to an application already under review keeps its reviews and status.

## Mapping from the applicant portal prototype

Field ids are from `Seed_Applicant_Portal_standalone_-Updated.html`.

| Prototype field | Send as |
|---|---|
| application ID | `ref`. Must be unique per applicant. A 4-digit code derived from the email is not unique across 10,000 applications, and a reused reference with a different email is refused. |
| `elig_email` | `email` |
| `full_name`, `mobile` | `name`, `phone` |
| `geography` (or `geography_other` when "Any other") | `geography` (send the free text for "Any other"; it lands as Unassigned for the central team) |
| `location` | `district`. For North-East India, where the options are states, send it as `state`. |
| `theme` | `theme` |
| `state`, `district` (current location) | `profile["Current location"]` |
| `dob`, `gender`, `languages`, `highest_qual`, `field_of_study`, `institution`, `year_completion`, `total_years`, `community_years`, `engaged`, `current_org`, `based_state`/`based_district`, `years_with_org`, `relocate`, `committed`, `connection`, `role_from`/`role_to`, `joining`, `source`/`source_name` | `profile`, keyed by the question label |
| `theme_opt2` | `profile["Theme — option 2"]` if the field stays |
| `role_desc` | `answers[{ key: "recent_role", label: "A brief summary about your most recent role", text }]` |
| `ref1_*`, `ref2_*` | `profile["Reference 1"]`, `profile["Reference 2"]` |
| `cv`, `sop`, `photo`, `cert10`, `degree_cert`, `exp_cert` | `documents` with kinds `cv`, `sop`, `photo`, `class10`, `degree`, `experience` |
| `g1`–`g7`, `g8` | `profile["Declarations"]`, `profile["Future cycles"]` |

The statement of purpose is read from PDF, Word (.docx) or PowerPoint (.pptx). Older `.doc` and `.ppt` files can't be read.

Criteria below the stated thresholds go in `criteriaFlags`, one entry per criterion, so they reach the decline queue rather than being turned away at the door.
