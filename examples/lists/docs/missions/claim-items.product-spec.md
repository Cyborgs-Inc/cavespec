---
spec_format_version: "0.1"
title: "Claim items"
artifact_type: "prd"
spec_revision: 1
author: "Example Co"
created_at: "2026-11-12T00:00:00Z"
updated_at: "2026-11-12T00:00:00Z"
---

## Problem

Two people buy the same thing because a list doesn't say who is getting what.

## Hypothesis

If anyone can claim an item with one tap, and everyone sees the claim at once, duplicate purchases drop.

## Product Summary

A claim button on every item, showing the claimer's name and how long ago they claimed it (Q-1), visible to the whole household (D-1).

## Scope

```productspec-scope
in:
  - Claim and unclaim an item with one tap.
  - Show the claimer's name and how long ago they claimed it on the item.
out:
  - Do not notify people when an item is claimed.
cut:
  - Cut claiming several items at once.
```

## Acceptance Criteria

```productspec-acceptance-criteria
- id: AC-1
  criterion: When someone taps claim on an item, every household member sees their name on it within two seconds.
- id: AC-2
  criterion: When the claimer taps unclaim, the item shows as unclaimed for everyone.
```

## Success Metrics

```productspec-success-metrics
- id: SM-1
  metric: duplicate_checkoffs_per_household_week
  target: "-50%"
  window: four weeks after launch
```
