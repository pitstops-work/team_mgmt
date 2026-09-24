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
