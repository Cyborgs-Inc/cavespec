---
spec_format_version: "0.1"
title: "Lists"
artifact_type: "prd"
spec_revision: 3
author: "Example Co"
created_at: "2026-11-01T00:00:00Z"
updated_at: "2026-11-16T00:00:00Z"
custom_sections:
  - id: custom-standing-decisions
    label: Standing Decisions
  - id: custom-features
    label: Features
  - id: custom-open-questions
    label: Open Questions
---

## Problem

Households keep shopping and chore lists in group chats, where items get buried, nobody knows what's done, and the same thing gets bought twice.

## Hypothesis

If a household can share one live list that shows who is doing what, they will stop duplicating purchases and chores, and keep using it weekly.

## Product Summary

A shared list app for households: live lists everyone can edit, items someone can claim, and a weekly view of what got done.

## Scope

```productspec-scope
in:
  - Live lists that everyone in a household can edit at once.
  - Claiming an item, so others can see who is doing it.
  - A weekly view of finished items, by person.
out:
  - Do not build payments or splitting costs between people.
  - Do not build a public social feed of lists.
cut:
  - Cut recurring items until households ask for them.
```

## Acceptance Criteria

```productspec-acceptance-criteria
- id: AC-1
  criterion: When two people in a household edit the same list, each sees the other's change within two seconds.
- id: AC-2
  criterion: When someone claims an item, everyone else in the household sees who claimed it.
- id: AC-3
  criterion: Given a week of finished items, the weekly view shows each person's finished items for that week.
```

## Success Metrics

```productspec-success-metrics
- id: SM-1
  metric: households_active_weekly_rate
  target: ">= 40%"
  window: households created in a month
```

## Standing Decisions

- **D-1 (2026-11-02, Maya):** A household is the only sharing unit. There are no per-list permissions: everyone in a household can see and edit every list, because per-list sharing confused every tester we showed it to.
- **D-2 (2026-11-05, Maya):** Lists sync through the server, never peer to peer. Offline edits queue on the device and are applied in order when it reconnects, and the server's order wins on conflicts.
- **D-3 (2026-11-10, Sam):** No accounts without an email address. A household invite is a link that expires after seven days, so a forwarded link stops working on its own.

## Features

What exists today.

- **Lists:** create, rename and archive lists in a household. Archived lists stay searchable for 90 days. `app/lists/`
- **Items:** add, edit, reorder and check off items; a checked item moves to the bottom and shows who checked it. `app/items/`
- **Invites:** invite by link (D-3); the link shows the household's name before joining. `app/invites/`

## Open Questions

Don't settle these yourself.

- **Q-1 Should claimed items expire?** Testers forget to unclaim. Until decided: claims never expire; show how long ago an item was claimed.
- **Q-2 Can a person be in two households?** Students and shared custody both came up. Until decided: one household per person; ask before changing it.
