import { compressProse, firstSentence, sentenceStarting } from "./compress";
import { parseSpec, type Spec, type SpecBlock, type SpecItem, type SpecSection } from "./spec";
import { estimateTokens } from "./tokens";

// The handoff: what an agent reads every turn to stay attached to intent, at two levels. The product spec says what
// the whole product is for and what's been decided; the mission spec says what this piece of work must do. Both go
// in one text that fits a token budget:
//   - binding parts stay word for word: Product Summary, Scope, Acceptance Criteria (and any section named in
//     `keep`), every id, and each open question's "Until decided" line;
//   - everything else is shortened caveman-style, then cut down step by step (reference lists first, decisions
//     last, the product before the mission) until it fits;
//   - the text says what was shortened and where the full spec is, so an agent reads it before touching that part.
// Unlike cutting at a character limit, every section is represented, however small the budget.

export type Level = "verbatim" | "compressed" | "lead" | "label" | "pointer";
type Role = "binding" | "decisions" | "questions" | "reference" | "narrative";

export interface HandoffSpecInput {
  path: string;
  markdown: string;
}

export interface HandoffOptions {
  /** The whole product's spec. */
  product: HandoffSpecInput;
  /** The spec for this piece of work, if any. It wins any room the budget has. */
  mission?: HandoffSpecInput | null;
  /** Token budget for the whole handoff (estimated). Default 6000. */
  budgetTokens?: number;
  /** More section headings to keep word for word, such as "How To Keep This Current". */
  keep?: string[];
}

export interface HandoffSection {
  spec: "product" | "mission";
  heading: string;
  /** The section's own level ("pointer" when it was cut to a line); its items may differ, see `items`. */
  level: Level;
  /** How many of its list items ended at each level. */
  items: Partial<Record<Level, number>>;
  /** Characters in the original section, and in the handoff. */
  chars: number;
  handoffChars: number;
}

export interface Handoff {
  text: string;
  tokens: number;
  budgetTokens: number;
  /** False when even the binding parts alone are over budget; the text is still complete. */
  fits: boolean;
  sections: HandoffSection[];
}

const BINDING = /^(product summary|scope|acceptance criteria|ai evals)$/i;
const DECISIONS = /decision/i;
const QUESTIONS = /open questions?/i;
const REFERENCE = /^(features|related artifacts|references|appendix|changelog|links)$/i;

interface Planned {
  spec: "product" | "mission";
  section: SpecSection;
  role: Role;
  /** The section's level: its prose, and "pointer" for the whole section. */
  level: Level;
  /** Each list item's own level, by block index. Items are cut down one at a time, longest first. */
  items: Map<number, Level>;
  /** The section as last rendered. */
  text: string;
}

/** Steps that shorten the handoff, applied in order until it fits: what readers need least goes first. */
const STEPS: [Role, Level][] = [
  ["reference", "lead"],
  ["reference", "label"],
  ["narrative", "lead"],
  ["questions", "lead"],
  ["decisions", "lead"],
  ["reference", "pointer"],
  ["narrative", "pointer"],
  ["decisions", "label"],
  ["questions", "label"],
  ["decisions", "pointer"],
  ["questions", "pointer"],
];

/** Builds the two-level handoff for an agent turn. */
export function buildHandoff(opts: HandoffOptions): Handoff {
  const budgetTokens = opts.budgetTokens ?? 6000;
  const keep = new Set((opts.keep ?? []).map((k) => k.toLowerCase()));
  const product = parseSpec(opts.product.markdown);
  const mission = opts.mission ? parseSpec(opts.mission.markdown) : null;
  const plan: Planned[] = [
    ...plannedFor("product", product, keep),
    ...(mission ? plannedFor("mission", mission, keep) : []),
  ];

  for (const p of plan) p.text = renderSection(p);
  const render = () => renderHandoff(opts, product, mission, plan);
  let text = render();
  const over = () => estimateTokens(text) > budgetTokens;
  // The product gives way first; the mission's own sections only when the product has nothing left to give.
  for (const spec of ["product", "mission"] as const) {
    for (const [role, level] of STEPS) {
      if (!over()) break;
      const sections = plan.filter((p) => p.spec === spec && p.role === role && rank(p.level) < rank(level));
      if (level === "pointer") {
        // Whole sections, biggest first.
        for (const p of sections.sort((a, b) => b.text.length - a.text.length)) {
          if (!over()) break;
          p.level = "pointer";
          p.text = renderSection(p);
          text = render();
        }
        continue;
      }
      // Prose first (one change per section), then items one at a time, longest first, so the budget fills evenly.
      for (const p of sections) {
        if (!over()) break;
        p.level = level;
        p.text = renderSection(p);
        text = render();
      }
      const items = sections.flatMap((p) => [...p.items.entries()].filter(([, l]) => rank(l) < rank(level)).map(([i]) => ({ p, i, len: renderItem(itemAt(p, i), p, p.items.get(i)!).length })));
      for (const { p, i } of items.sort((a, b) => b.len - a.len)) {
        if (!over()) break;
        p.items.set(i, level);
        p.text = renderSection(p);
        text = render();
      }
    }
  }
  const tokens = estimateTokens(text);
  return {
    text,
    tokens,
    budgetTokens,
    fits: tokens <= budgetTokens,
    sections: plan.map((p) => {
      const items: Partial<Record<Level, number>> = {};
      if (p.level !== "pointer") for (const l of p.items.values()) items[l] = (items[l] ?? 0) + 1;
      return { spec: p.spec, heading: p.section.heading, level: p.level, items, chars: p.section.raw.length, handoffChars: p.text.length };
    }),
  };
}

function plannedFor(spec: "product" | "mission", parsed: Spec, keep: Set<string>): Planned[] {
  return parsed.sections.map((section) => {
    const role = roleOf(section.heading, keep);
    const level: Level = role === "binding" ? "verbatim" : "compressed";
    const items = new Map<number, Level>();
    section.blocks.forEach((b, i) => b.kind === "item" && items.set(i, level));
    return { spec, section, role, level, items, text: "" };
  });
}

function itemAt(p: Planned, i: number): SpecItem {
  return (p.section.blocks[i] as Extract<SpecBlock, { kind: "item" }>).item;
}

function roleOf(heading: string, keep: Set<string>): Role {
  if (BINDING.test(heading) || keep.has(heading.toLowerCase())) return "binding";
  if (QUESTIONS.test(heading)) return "questions";
  if (DECISIONS.test(heading)) return "decisions";
  if (REFERENCE.test(heading)) return "reference";
  return "narrative";
}

function rank(level: Level): number {
  return ["verbatim", "compressed", "lead", "label", "pointer"].indexOf(level);
}

function renderHandoff(opts: HandoffOptions, product: Spec, mission: Spec | null, plan: Planned[]): string {
  const out: string[] = [];
  const shortened = plan.filter((p) => cutDown(p));
  out.push(header("Product spec", opts.product.path, product));
  if (mission) out.push(`Mission spec: ${opts.mission!.path} (below). The mission works inside the product spec; its decisions apply.`);
  out.push(
    `Word for word: scope, acceptance criteria, ids, "Until decided" lines. Other prose is shortened${shortened.length ? `; cut down most: ${shortened.map((p) => `${p.spec === "mission" ? "mission " : ""}${p.section.heading}`).join(", ")}` : ""}. Read the full spec before changing anything a shortened part covers.`,
  );
  for (const p of plan.filter((x) => x.spec === "product")) out.push(p.text);
  if (mission && opts.mission) {
    out.push(header("Mission spec", opts.mission.path, mission));
    for (const p of plan.filter((x) => x.spec === "mission")) out.push(p.text);
  }
  return out.filter(Boolean).join("\n\n").trim() + "\n";
}

function header(kind: string, path: string, spec: Spec): string {
  const title = spec.meta.title ?? path.split("/").pop() ?? path;
  const rev = spec.meta.spec_revision ? `, rev ${spec.meta.spec_revision}` : "";
  return `# ${kind}: ${title} (${path}${rev})`;
}

function renderSection(p: Planned): string {
  const head = `## ${p.section.heading}`;
  if (p.level === "verbatim") return p.section.raw;
  const items = p.section.blocks.filter((b) => b.kind === "item").length;
  if (p.level === "pointer") return `${head}\n(${items ? `${items} items` : "shortened"}: see the full spec.)`;
  const body = p.section.blocks.map((b, i) => (b.kind === "item" ? renderItem(b.item, p, p.items.get(i)!) : renderBlock(b, p))).filter(Boolean);
  // Nothing left (a section that's only a fenced block, say): say where it is rather than show a bare heading.
  if (!body.length) return `${head}\n(Shortened: see the full spec.)`;
  return [head, ...body].join("\n");
}

/** Whether any of a section was cut down past shortening. */
function cutDown(p: Planned): boolean {
  return rank(p.level) > rank("compressed") || [...p.items.values()].some((l) => rank(l) > rank("compressed"));
}

function renderBlock(b: Exclude<SpecBlock, { kind: "item" }>, p: Planned): string {
  if (b.kind === "fence") return p.level === "compressed" ? b.text : "";
  if (b.kind === "text") {
    const short = compressProse(b.text);
    if (p.level === "compressed") return short;
    // Instructions about the section ("Don't settle these yourself") are worth keeping at "lead".
    return p.level === "lead" ? firstSentence(short) : "";
  }
  return "";
}

function renderItem(item: SpecItem, p: Planned, level: Level): string {
  const body = compressProse(item.body);
  const fullLabel = item.label ? compressProse(item.label) : null;
  const shortLabel = item.id ?? (fullLabel ? fullLabel.replace(/\s*\([^)]*\)\s*$/, "") : null);
  // A label that is a question ("Q-9 How do squads work?") needs no colon after it.
  const lead = (label: string | null, text: string) => `- ${label ? `${label}${/[?!]$/.test(label) ? " " : ": "}` : ""}${text}`.trimEnd();
  switch (level) {
    case "compressed":
      return lead(fullLabel, body);
    case "lead": {
      const until = p.role === "questions" ? sentenceStarting(body, /Until decided:/i) : null;
      const first = firstSentence(body);
      // A question's label is its question; its first body sentence adds little next to "Until decided".
      return lead(p.role === "questions" ? fullLabel : shortLabel, [p.role === "questions" && until ? null : first, until].filter(Boolean).join(" "));
    }
    case "label": {
      if (p.role === "reference") return lead(null, shortLabel ?? truncateWords(firstSentence(body), 8));
      if (p.role === "questions") {
        const until = sentenceStarting(body, /Until decided:/i);
        return lead(fullLabel, until ?? "");
      }
      return lead(shortLabel, truncateWords(firstSentence(body), 12));
    }
    default:
      return lead(fullLabel, body);
  }
}

function truncateWords(text: string, n: number): string {
  const words = text.split(/\s+/);
  return words.length <= n ? text : `${words.slice(0, n).join(" ")}…`;
}
