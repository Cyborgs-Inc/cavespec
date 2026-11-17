# cavespec

Keep coding agents on two levels of intent, **product** and **mission**, in few tokens.

A product spec says what the whole product is for, what's in and out of scope, and what's already been decided. A mission spec says what one piece of work must do. Agents need both on every turn, and both grow. The usual fix, cutting the spec at a character limit, silently drops whatever comes last.

cavespec builds one compact **handoff** from the two specs that fits a token budget:

- **Word for word:** Product Summary, Scope, Acceptance Criteria, every id (AC-, D-, Q-), and each open question's "Until decided" line.
- **Shortened, [caveman](https://github.com/juliusbrussee/caveman)-style:** the rest of the prose. Filler words and articles go; code, quotes, ids, numbers and paths stay exactly as written.
- **Cut down step by step until it fits:** reference lists first, then narrative, then decisions, one item at a time, longest first. The product gives way before the mission.
- **Honest about it:** the handoff says what it cut down most and where the full spec is, so the agent reads it before touching that part.

Specs are plain [ProductSpec](https://github.com/gokulrajaram/ProductSpec) files (`*.product-spec.md`). cavespec adds no format of its own.

## What it does on a real spec

Measured on the product spec of [Cyborgs](https://cyborg6.com) on Nov 16, 2026, 110 KB (about 27,500 tokens), at the same budget of about 6,000 tokens a turn:

| | Cut at 24,000 characters | cavespec handoff |
| --- | --- | --- |
| Standing decisions | 14 of 41 | 41 of 41 (23 shortened, 18 first sentence) |
| Open questions | 0 of 7 | 7 of 7, each with its "Until decided" line |
| Features | 0 of 66 | 66 of 66, by name |
| Acceptance criteria | 19 of 19 | 19 of 19, word for word |

Token counts are estimates (about 4 characters a token). We haven't yet measured what this does to agent behavior or cost; that's next, and the number goes here when we have it.

## Quick start

```bash
npm install --save-dev cavespec
npx cavespec measure     # what a plain cut keeps vs the handoff, section by section
npx cavespec handoff     # the text an agent reads each turn
npx cavespec check       # check the product spec and its mission specs
```

Tell cavespec where your specs are with `cavespec.json` at the repository root (without one, the product spec is the only `*.product-spec.md` at the root or in `docs/`, and every other spec under `docs/` is a mission spec):

```json
{
  "product": "docs/product.product-spec.md",
  "missions": ["docs/missions/*.product-spec.md"],
  "budget": 6000,
  "keep": ["How To Keep This Current"]
}
```

`keep` names more sections to keep word for word. [`examples/lists`](examples/lists) is a small product with two missions.

## Commands

| Command | What it does |
| --- | --- |
| `cavespec handoff [--mission <spec>] [--budget <tokens>]` | Prints the handoff. `--json` adds what happened to each section. |
| `cavespec measure [--mission <spec>] [--budget <tokens>]` | Compares a plain character cut at the same budget with the handoff, section by section. |
| `cavespec check` | Required sections, duplicate ids, a mission citing a decision (D-) or question (Q-) the product never defined, a mission putting in scope what the product rules out, and whether each mission's handoff fits. Runs ProductSpec's own validator too when `@productspec/parser` is installed. Exits 1 on errors. |

Common options: `--product <spec>`, `--config <file>`, `--keep "<Heading>,<Heading>"`, `--root <dir>`.

## For agents

[`skill/SKILL.md`](skill/SKILL.md) teaches Claude Code, Codex or Gemini how to work from the specs: run the handoff at the start of a task, read the full spec before touching a shortened part, keep to scope, cite AC ids, treat decisions as settled and open questions as open, and reply tersely except where text becomes someone else's instructions.

```bash
npx skills add Cyborgs-Inc/cavespec
```

## In CI

```yaml
- uses: Cyborgs-Inc/cavespec@v0
  with:
    config: cavespec.json
```

## As a library

```ts
import { buildHandoff } from "cavespec";

const { text, tokens, fits, sections } = buildHandoff({
  product: { path: "docs/product.product-spec.md", markdown: productMarkdown },
  mission: { path: "docs/missions/claim.product-spec.md", markdown: missionMarkdown },
  budgetTokens: 6000,
});
```

Same input, same output: there's no model in the loop, so the handoff is cheap, fast and cacheable.

## Credits

The spec format is [ProductSpec](https://github.com/gokulrajaram/ProductSpec) by Gokul Rajaram. The terse style is from [caveman](https://github.com/juliusbrussee/caveman) by Julius Brussee. Built and used in production by [Cyborgs](https://cyborg6.com).

## License

MIT
