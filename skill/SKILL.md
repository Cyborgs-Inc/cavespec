---
name: cavespec
description: Work from this repository's product spec and mission spec (ProductSpec *.product-spec.md files) without losing intent or spending tokens on it. Use at the start of any coding task in a repo with a cavespec.json or *.product-spec.md files, and whenever a change might touch scope, acceptance criteria or a standing decision.
---

# Working from specs with cavespec

This repository states its intent at two levels:

- **Product spec**: what the whole product is for, what's in and out of scope, the decisions already made (D- ids) and open questions (Q- ids).
- **Mission spec** (optional): what this piece of work must do, with its own acceptance criteria (AC- ids).

## At the start of a task

1. Run `npx cavespec handoff` (add `--mission <path>` when the task names a mission spec). Read all of it. It fits a token budget: scope, acceptance criteria, ids and "Until decided" lines are word for word; other prose is shortened, and its header names the sections that were cut down most.
2. Before changing anything a shortened section covers, open the full spec and read that section. The handoff is a map, not the territory.

## While working

- Keep inside the mission's scope and the product's. `scope.out` and `scope.cut` are decisions: don't build them, even if asked in passing. Say so and point at the line.
- Cite AC- ids in plans, commits and pull requests ("Covers AC-2").
- Treat standing decisions (D- ids) as settled. Treat open questions (Q- ids) as unsettled: follow their "Until decided" line and don't settle them yourself.
- If implementation pressure changes intent, stop and propose a spec change. Don't change intent in code.

## How to write replies

Terse, caveman-style, for status and explanations: no filler, no restating the question. Write full sentences for anything that becomes someone else's instructions (a spec change, a prompt for another agent, a follow-up), and for every question to a person.

## Checking

`npx cavespec check` validates both levels: required sections, duplicate ids, a mission citing a decision the product never made, a mission putting in scope what the product rules out, and whether each handoff fits its budget.
