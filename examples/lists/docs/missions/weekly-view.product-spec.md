---
spec_format_version: "0.1"
title: "Weekly view"
artifact_type: "prd"
spec_revision: 1
author: "Example Co"
created_at: "2026-11-14T00:00:00Z"
updated_at: "2026-11-14T00:00:00Z"
---

## Problem

Households can't see who did what this week, so the same people end up doing everything and nobody notices.

## Hypothesis

If a weekly view shows each person's finished items, households balance the work themselves.

## Product Summary

A weekly page listing each person's finished items, Monday to Sunday, from the server's record of check-offs (D-2).

## Scope

```productspec-scope
in:
  - A weekly page grouping finished items by the person who checked them off.
  - Moving between weeks.
out:
  - Do not rank people or show scores.
cut:
  - Cut exporting the week.
```

## Acceptance Criteria

```productspec-acceptance-criteria
- id: AC-1
  criterion: Given items checked off this week, the weekly page lists each person's finished items under their name.
- id: AC-2
  criterion: When someone moves to the previous week, the page shows that week's finished items.
```

## Success Metrics

```productspec-success-metrics
- id: SM-1
  metric: weekly_view_opened_per_household_week
  target: ">= 1"
  window: four weeks after launch
```
