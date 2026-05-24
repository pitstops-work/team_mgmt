export type WikiPageType = "principle" | "playbook" | "runbook";

const PLAYBOOK = `## Purpose

What this playbook is for and who it helps.

## Preconditions

When this playbook applies. What must be true before starting.

## Core flow

The steps in order.

1. ...
2. ...

## Judgment calls

The places where the playbook bends. What to weigh.

## Common failure modes

What goes wrong and how to spot it early.

## What good looks like

Concrete signals you got this right.

## Open questions

Things we still don't know.

## Related pages

`;

const RUNBOOK = `## Purpose

What this runbook accomplishes.

## When this applies

The conditions that trigger this runbook.

## Documents required

What the citizen / partner / team must bring.

## Step-by-step

1. ...
2. ...

## Timelines

How long each step takes; total expected time.

## Common rejection reasons

Why this fails and what to do about it.

## Escalation path

Who to go to when the standard flow doesn't work.

## Recent changes

Updates to scheme rules or process worth flagging.
`;

const PRINCIPLE = `## Statement

The principle in one sentence.

## What this means in practice

How this shows up day-to-day.

## What this rules out

Patterns and shortcuts that violate this.

## Related principles

`;

export function templateFor(type: WikiPageType): string {
  switch (type) {
    case "playbook":
      return PLAYBOOK;
    case "runbook":
      return RUNBOOK;
    case "principle":
      return PRINCIPLE;
  }
}

export const WIKI_PAGE_TYPES: WikiPageType[] = ["principle", "playbook", "runbook"];
