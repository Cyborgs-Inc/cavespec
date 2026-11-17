import { buildHandoff, type HandoffSpecInput } from "./handoff";
import { parseSpec, referencedIds, scopeList, specIds, type Spec } from "./spec";

// Checks for a product spec and the mission specs under it. Structure only goes as deep as a handoff needs: for the
// full ProductSpec rules, run its own validator (the CLI does when @productspec/parser is installed).

export interface Finding {
  level: "error" | "warning";
  path: string;
  message: string;
}

export interface CheckOptions {
  product: HandoffSpecInput;
  missions?: HandoffSpecInput[];
  /** The handoff budget each mission's handoff should fit (estimated tokens). Default 6000. */
  budgetTokens?: number;
  keep?: string[];
}

const REQUIRED = ["Product Summary", "Scope", "Acceptance Criteria"];
/** Scope lines this similar (shared content words) count as the same thing. */
const SAME_SCOPE = 0.6;

export function checkSpecs(opts: CheckOptions): Finding[] {
  const findings: Finding[] = [];
  const product = parseSpec(opts.product.markdown);
  findings.push(...structure(opts.product.path, product));
  const productIds = specIds(product);
  const productOut = [...scopeList(product, "out"), ...scopeList(product, "cut")];

  for (const m of opts.missions ?? []) {
    if (m.path === opts.product.path) continue;
    const mission = parseSpec(m.markdown);
    findings.push(...structure(m.path, mission));
    // Ids it leans on must exist somewhere: a mission citing D-99 points at a decision nobody made.
    const own = specIds(mission);
    const body = mission.sections.map((s) => s.raw).join("\n");
    for (const id of referencedIds(body)) {
      if (!own.has(id) && !productIds.has(id) && /^(D|Q)-\d+$/.test(id)) {
        findings.push({ level: "warning", path: m.path, message: `Refers to ${id}, which neither it nor the product spec (${opts.product.path}) defines.` });
      }
    }
    // Putting in scope what the product rules out is a product decision, not a mission's.
    for (const line of scopeList(mission, "in")) {
      const clash = productOut.find((o) => similarity(line, o) >= SAME_SCOPE);
      if (clash) findings.push({ level: "warning", path: m.path, message: `Its scope includes "${line}", which the product spec rules out: "${clash}". Change the product spec first, or drop it here.` });
    }
    const handoff = buildHandoff({ product: opts.product, mission: m, budgetTokens: opts.budgetTokens, keep: opts.keep });
    if (!handoff.fits) {
      findings.push({ level: "warning", path: m.path, message: `Its handoff needs about ${handoff.tokens} tokens with nothing left to shorten, over the ${handoff.budgetTokens} budget. Its own scope and acceptance criteria are the parts that can't shrink.` });
    }
  }
  return findings;
}

function structure(path: string, spec: Spec): Finding[] {
  const out: Finding[] = [];
  const headings = new Set(spec.sections.map((s) => s.heading.toLowerCase()));
  for (const h of REQUIRED) if (!headings.has(h.toLowerCase())) out.push({ level: "error", path, message: `Has no "## ${h}" section.` });
  const seen = new Map<string, number>();
  for (const s of spec.sections) {
    for (const b of s.blocks) {
      const ids = b.kind === "item" ? (b.item.id ? [b.item.id] : []) : b.kind === "fence" ? [...b.text.matchAll(/^\s*-?\s*id:\s*["']?([A-Z]{1,4}-\d+)/gm)].map((m) => m[1]) : [];
      for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  for (const [id, n] of seen) if (n > 1) out.push({ level: "error", path, message: `Defines ${id} ${n} times.` });
  return out;
}

const STOP = new Set("a an the and or of to in on for with by is are be it its this that as at from not no only any all each into than then them they their which who".split(" "));

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)).map(stem) ?? []);
}

/** Rough stemming, enough that "splitting" meets "split" and "costs" meets "cost". */
function stem(w: string): string {
  const s = w.replace(/(?:ing|ed|es|s)$/, "");
  return (s.length >= 3 ? s : w).replace(/(.)\1$/, "$1");
}

/** Shared content words over the smaller set: 1 when one line's words are all in the other. */
export function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  // Too few words to tell two lines apart.
  if (Math.min(x.size, y.size) < 3) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}
