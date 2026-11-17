import fs from "node:fs";
import path from "node:path";
import { checkSpecs, type Finding } from "./check";
import { DEFAULT_BUDGET, loadConfig, type Config } from "./config";
import { buildHandoff } from "./handoff";
import { measureCut } from "./measure";

// cavespec: keep coding agents on two levels of intent, product and mission, in few tokens.
//
//   cavespec handoff [--mission <spec>] [--budget <tokens>]    the text an agent reads each turn
//   cavespec measure [--mission <spec>] [--budget <tokens>]    what a plain cut keeps vs the handoff
//   cavespec check                                             validate the specs and how they fit together
//
// Options: --product <spec>, --config <file> (default cavespec.json), --keep "<Heading>,<Heading>", --json, --root <dir>.

const HELP = `cavespec: keep coding agents on two levels of intent, product and mission, in few tokens.

Usage:
  cavespec handoff [--mission <spec>] [--budget <tokens>]   Print the handoff an agent reads each turn
  cavespec measure [--mission <spec>] [--budget <tokens>]   Compare a plain character cut with the handoff
  cavespec check                                            Check the product spec and its mission specs

Options:
  --product <spec>      The product spec (default: from cavespec.json, or the only *.product-spec.md)
  --config <file>       Config file (default: cavespec.json)
  --keep <headings>     More sections to keep word for word, comma-separated
  --root <dir>          Repository root (default: the current folder)
  --json                Machine-readable output
Token counts are estimates (about 4 characters a token).`;

interface Output {
  write(text: string): unknown;
}

export async function main(argv: string[], out: Output = process.stdout, err: Output = process.stderr): Promise<number> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  if (!command || command === "help" || flags.help) {
    out.write(`${HELP}\n`);
    return command ? 0 : 1;
  }
  const root = path.resolve(String(flags.root ?? "."));
  let config: Config;
  try {
    config = flags.product
      ? { product: String(flags.product), missions: [], budget: DEFAULT_BUDGET, keep: [] }
      : loadConfig(root, String(flags.config ?? "cavespec.json"));
  } catch (e) {
    err.write(`${(e as Error).message}\n`);
    return 2;
  }
  const budget = flags.budget ? Number(flags.budget) : config.budget;
  const keep = flags.keep ? String(flags.keep).split(",").map((k) => k.trim()).filter(Boolean) : config.keep;
  const read = (p: string) => ({ path: p, markdown: fs.readFileSync(path.join(root, p), "utf8") });
  const product = read(config.product);
  const mission = flags.mission ? read(String(flags.mission)) : null;

  if (command === "handoff") {
    const h = buildHandoff({ product, mission, budgetTokens: budget, keep });
    out.write(flags.json ? `${JSON.stringify(h, null, 2)}\n` : h.text);
    if (!h.fits) err.write(`cavespec: about ${h.tokens} tokens, over the ${budget} budget with nothing left to shorten.\n`);
    return 0;
  }

  if (command === "measure") {
    const h = buildHandoff({ product, mission, budgetTokens: budget, keep });
    const cut = measureCut(product.markdown, budget * 4);
    if (flags.json) {
      out.write(`${JSON.stringify({ cut, handoff: { tokens: h.tokens, budgetTokens: h.budgetTokens, fits: h.fits, sections: h.sections } }, null, 2)}\n`);
      return 0;
    }
    out.write(`${product.path}: ${cut.chars} characters, about ${cut.tokens} tokens.\n`);
    out.write(`A plain cut at ${cut.cutChars} characters (about ${cut.cutTokens} tokens) vs the cavespec handoff (about ${h.tokens} of ${budget} tokens):\n\n`);
    const rows = [["Section", "Chars", "Cut keeps", "Handoff"]];
    for (const s of cut.sections) {
      const hs = h.sections.find((x) => x.spec === "product" && x.heading === s.heading);
      rows.push([s.heading, String(s.chars), `${s.seenPercent}%`, hs ? describe(hs) : "-"]);
    }
    if (mission) for (const hs of h.sections.filter((x) => x.spec === "mission")) rows.push([`(mission) ${hs.heading}`, String(hs.chars), "-", describe(hs)]);
    out.write(`${table(rows)}\n`);
    return 0;
  }

  if (command === "check") {
    const missions = (flags.mission ? [String(flags.mission)] : config.missions).map(read);
    const findings: Finding[] = [...(await validateWithProductSpec([product, ...missions])), ...checkSpecs({ product, missions, budgetTokens: budget, keep })];
    if (flags.json) out.write(`${JSON.stringify(findings, null, 2)}\n`);
    else if (!findings.length) out.write(`cavespec: ${1 + missions.length} spec${missions.length ? "s" : ""} checked, nothing to fix.\n`);
    else for (const f of findings) out.write(`${f.level}: ${f.path}: ${f.message}\n`);
    return findings.some((f) => f.level === "error") ? 1 : 0;
  }

  err.write(`Unknown command "${command}".\n\n${HELP}\n`);
  return 1;
}

function describe(s: { level: string; items: Partial<Record<string, number>>; handoffChars: number }): string {
  if (s.level === "verbatim") return "word for word";
  if (s.level === "pointer") return "one line";
  const items = Object.entries(s.items).filter(([, n]) => n);
  const what = items.length ? items.map(([l, n]) => `${n} ${LEVEL_WORDS[l] ?? l}`).join(", ") : LEVEL_WORDS[s.level] ?? s.level;
  return `${what} (${s.handoffChars} chars)`;
}

const LEVEL_WORDS: Record<string, string> = { compressed: "shortened", lead: "first sentence", label: "name only", verbatim: "word for word" };

/** ProductSpec's own validator, when it's installed beside this tool. */
type Validate = (md: string) => { valid: boolean; errors?: { message: string }[] };

async function validateWithProductSpec(specs: { path: string; markdown: string }[]): Promise<Finding[]> {
  let validate: Validate | undefined;
  try {
    const name = "@productspec/parser";
    validate = ((await import(name)) as { validateProductSpecMarkdown?: Validate }).validateProductSpecMarkdown;
  } catch {
    return [];
  }
  if (!validate) return [];
  const check: Validate = validate;
  return specs.flatMap((s) => {
    const r = check(s.markdown);
    return r.valid ? [] : (r.errors ?? [{ message: "isn't a valid ProductSpec" }]).map((e) => ({ level: "error" as const, path: s.path, message: `ProductSpec: ${e.message}` }));
  });
}

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=", 2);
    if (v !== undefined) flags[k] = v;
    else if (args[i + 1] && !args[i + 1].startsWith("--")) flags[k] = args[++i];
    else flags[k] = true;
  }
  return flags;
}

function table(rows: string[][]): string {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  return rows.map((r, i) => r.map((cell, c) => cell.padEnd(widths[c])).join("  ").trimEnd() + (i === 0 ? `\n${widths.map((w) => "-".repeat(w)).join("  ")}` : "")).join("\n");
}
