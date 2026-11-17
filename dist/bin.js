#!/usr/bin/env node

// src/cli.ts
import fs2 from "node:fs";
import path2 from "node:path";

// src/compress.ts
var FILLER = /\b(?:just|really|very|basically|actually|simply|quite|certainly|definitely|essentially)\b\s*/gi;
var ARTICLES = /\b(?:the|a|an)\s+(?=\S)/g;
var LEADING_ARTICLES = /(^|[.!?:]\s+|\n\s*)(?:The|A|An)\s+(?=\S)/g;
var PHRASES = [
  [/\bin order to\b/gi, "to"],
  [/\bfor example\b/gi, "e.g."],
  [/\bsuch as\b/gi, "like"],
  [/\bis able to\b/gi, "can"],
  [/\bare able to\b/gi, "can"],
  [/\bat the moment\b/gi, "now"],
  [/\bas well as\b/gi, "and"],
  [/\ba number of\b/gi, "several"],
  [/\bin addition\b/gi, "also"],
  [/\bwhether or not\b/gi, "whether"],
  [/\bso that\b/gi, "so"],
  [/\bthat is to say\b/gi, "i.e."],
  [/\bdoes not\b/gi, "doesn't"],
  [/\bdo not\b/gi, "don't"],
  [/\bis not\b/gi, "isn't"],
  [/\bcannot\b/gi, "can't"]
];
var PROTECTED = /`[^`\n]+`|"[^"\n]{1,200}"|“[^”\n]{1,200}”|\bhttps?:\/\/\S+|(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+\.\w+/g;
function compressProse(text) {
  let s = text.replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, "$1");
  const kept = [];
  s = s.replace(PROTECTED, (m) => {
    kept.push(m);
    return `\0${kept.length - 1}\0`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:])/g, "$1$2");
  for (const [re, to] of PHRASES) s = s.replace(re, (m) => keepCase(m, to));
  s = s.replace(FILLER, "").replace(ARTICLES, "").replace(LEADING_ARTICLES, "$1");
  s = s.replace(/[ \t]{2,}/g, " ").replace(/ +([,.;:)])/g, "$1").replace(/\( +/g, "(").replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]).trim();
}
function keepCase(original, replacement) {
  return original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}
function firstSentence(text) {
  const masked = text.replace(/`[^`\n]+`|"[^"\n]*"|\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Ms|No)\.|\d\.\d/g, (m2) => "".repeat(m2.length));
  const m = /[.!?](?=\s+[A-Z`"(*]|\s*$)/.exec(masked);
  return m ? text.slice(0, m.index + 1).trim() : text.trim();
}
function sentenceStarting(text, lead) {
  const m = lead.exec(text);
  if (!m) return null;
  return firstSentence(text.slice(m.index));
}

// src/spec.ts
var ID = /^(?:[A-Z]{1,4}-\d+)\b/;
function parseSpec(markdown) {
  const text = markdown.replace(/\r\n/g, "\n");
  let rest = text;
  let frontMatter = "";
  const meta = {};
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (fm) {
    frontMatter = fm[0].trimEnd();
    rest = text.slice(fm[0].length);
    for (const line of fm[1].split("\n")) {
      const m = /^([A-Za-z_][\w-]*):\s*(.+)$/.exec(line);
      if (m && !m[2].startsWith("|") && !m[2].startsWith(">")) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  const lines = rest.split("\n");
  const sections = [];
  const preamble = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence && /^(#{2})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      if (current) sections.push(toSection(current));
      current = { heading: h[2], depth: h[1].length, lines: [line] };
    } else if (current) current.lines.push(line);
    else preamble.push(line);
  }
  if (current) sections.push(toSection(current));
  return { meta, frontMatter, preamble: preamble.join("\n").trim(), sections };
}
function toSection(s) {
  return { heading: s.heading, depth: s.depth, blocks: toBlocks(s.lines.slice(1)), raw: s.lines.join("\n").trimEnd() };
}
function toBlocks(lines) {
  const blocks = [];
  let i = 0;
  const para = [];
  const flush = () => {
    const t = para.join("\n").trim();
    if (t) blocks.push({ kind: "text", text: t });
    para.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)\s*(\S*)/.exec(line);
    if (fence) {
      flush();
      const body = [line];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) body.push(lines[i++]);
      blocks.push({ kind: "fence", info: fence[2], text: body.join("\n") });
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flush();
      const itemLines = [line];
      i++;
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === "" && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]))) itemLines.push(lines[i++]);
      blocks.push({ kind: "item", item: toItem(itemLines) });
      continue;
    }
    if (line.trim() === "") flush();
    else para.push(line);
    i++;
  }
  flush();
  return blocks;
}
function toItem(lines) {
  const raw = lines.join("\n");
  const first = lines[0].replace(/^[-*]\s+/, "");
  const joined = [first, ...lines.slice(1).map((l) => l.trim())].filter(Boolean).join(" ");
  const bold = /^\*\*(.+?)\*\*:?\s*/.exec(joined);
  const label = bold ? bold[1].replace(/:\s*$/, "").trim() : null;
  const body = bold ? joined.slice(bold[0].length).trim() : joined.trim();
  const id = (label && ID.exec(label)?.[0]) ?? ID.exec(body)?.[0] ?? null;
  return { id, label, body, raw };
}
function specIds(spec) {
  const ids = /* @__PURE__ */ new Set();
  for (const s of spec.sections) {
    for (const b of s.blocks) {
      if (b.kind === "item" && b.item.id) ids.add(b.item.id);
      if (b.kind === "fence") for (const m of b.text.matchAll(/^\s*-?\s*id:\s*["']?([A-Z]{1,4}-\d+)/gm)) ids.add(m[1]);
    }
  }
  return ids;
}
function referencedIds(text) {
  return [...new Set([...text.matchAll(/\b([A-Z]{1,4}-\d+)\b/g)].map((m) => m[1]))];
}
function scopeList(spec, key) {
  for (const s of spec.sections) {
    for (const b of s.blocks) {
      if (b.kind !== "fence" || !/scope/i.test(b.info)) continue;
      const out = [];
      let on = false;
      for (const line of b.text.split("\n")) {
        const k = /^(\w+):\s*$/.exec(line);
        if (k) on = k[1] === key;
        else if (on) {
          const m = /^\s*-\s+(.+)$/.exec(line);
          if (m) out.push(m[1].replace(/^["']|["']$/g, ""));
        }
      }
      return out;
    }
  }
  return [];
}

// src/tokens.ts
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

// src/handoff.ts
var BINDING = /^(product summary|scope|acceptance criteria|ai evals)$/i;
var DECISIONS = /decision/i;
var QUESTIONS = /open questions?/i;
var REFERENCE = /^(features|related artifacts|references|appendix|changelog|links)$/i;
var STEPS = [
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
  ["questions", "pointer"]
];
function buildHandoff(opts) {
  const budgetTokens = opts.budgetTokens ?? 6e3;
  const keep = new Set((opts.keep ?? []).map((k) => k.toLowerCase()));
  const product = parseSpec(opts.product.markdown);
  const mission = opts.mission ? parseSpec(opts.mission.markdown) : null;
  const plan = [
    ...plannedFor("product", product, keep),
    ...mission ? plannedFor("mission", mission, keep) : []
  ];
  for (const p of plan) p.text = renderSection(p);
  const render = () => renderHandoff(opts, product, mission, plan);
  let text = render();
  const over = () => estimateTokens(text) > budgetTokens;
  for (const spec of ["product", "mission"]) {
    for (const [role, level] of STEPS) {
      if (!over()) break;
      const sections = plan.filter((p) => p.spec === spec && p.role === role && rank(p.level) < rank(level));
      if (level === "pointer") {
        for (const p of sections.sort((a, b) => b.text.length - a.text.length)) {
          if (!over()) break;
          p.level = "pointer";
          p.text = renderSection(p);
          text = render();
        }
        continue;
      }
      for (const p of sections) {
        if (!over()) break;
        p.level = level;
        p.text = renderSection(p);
        text = render();
      }
      const items = sections.flatMap((p) => [...p.items.entries()].filter(([, l]) => rank(l) < rank(level)).map(([i]) => ({ p, i, len: renderItem(itemAt(p, i), p, p.items.get(i)).length })));
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
      const items = {};
      if (p.level !== "pointer") for (const l of p.items.values()) items[l] = (items[l] ?? 0) + 1;
      return { spec: p.spec, heading: p.section.heading, level: p.level, items, chars: p.section.raw.length, handoffChars: p.text.length };
    })
  };
}
function plannedFor(spec, parsed, keep) {
  return parsed.sections.map((section) => {
    const role = roleOf(section.heading, keep);
    const level = role === "binding" ? "verbatim" : "compressed";
    const items = /* @__PURE__ */ new Map();
    section.blocks.forEach((b, i) => b.kind === "item" && items.set(i, level));
    return { spec, section, role, level, items, text: "" };
  });
}
function itemAt(p, i) {
  return p.section.blocks[i].item;
}
function roleOf(heading, keep) {
  if (BINDING.test(heading) || keep.has(heading.toLowerCase())) return "binding";
  if (QUESTIONS.test(heading)) return "questions";
  if (DECISIONS.test(heading)) return "decisions";
  if (REFERENCE.test(heading)) return "reference";
  return "narrative";
}
function rank(level) {
  return ["verbatim", "compressed", "lead", "label", "pointer"].indexOf(level);
}
function renderHandoff(opts, product, mission, plan) {
  const out = [];
  const shortened = plan.filter((p) => cutDown(p));
  out.push(header("Product spec", opts.product.path, product));
  if (mission) out.push(`Mission spec: ${opts.mission.path} (below). The mission works inside the product spec; its decisions apply.`);
  out.push(
    `Word for word: scope, acceptance criteria, ids, "Until decided" lines. Other prose is shortened${shortened.length ? `; cut down most: ${shortened.map((p) => `${p.spec === "mission" ? "mission " : ""}${p.section.heading}`).join(", ")}` : ""}. Read the full spec before changing anything a shortened part covers.`
  );
  for (const p of plan.filter((x) => x.spec === "product")) out.push(p.text);
  if (mission && opts.mission) {
    out.push(header("Mission spec", opts.mission.path, mission));
    for (const p of plan.filter((x) => x.spec === "mission")) out.push(p.text);
  }
  return out.filter(Boolean).join("\n\n").trim() + "\n";
}
function header(kind, path3, spec) {
  const title = spec.meta.title ?? path3.split("/").pop() ?? path3;
  const rev = spec.meta.spec_revision ? `, rev ${spec.meta.spec_revision}` : "";
  return `# ${kind}: ${title} (${path3}${rev})`;
}
function renderSection(p) {
  const head = `## ${p.section.heading}`;
  if (p.level === "verbatim") return p.section.raw;
  const items = p.section.blocks.filter((b) => b.kind === "item").length;
  if (p.level === "pointer") return `${head}
(${items ? `${items} items` : "shortened"}: see the full spec.)`;
  const body = p.section.blocks.map((b, i) => b.kind === "item" ? renderItem(b.item, p, p.items.get(i)) : renderBlock(b, p)).filter(Boolean);
  if (!body.length) return `${head}
(Shortened: see the full spec.)`;
  return [head, ...body].join("\n");
}
function cutDown(p) {
  return rank(p.level) > rank("compressed") || [...p.items.values()].some((l) => rank(l) > rank("compressed"));
}
function renderBlock(b, p) {
  if (b.kind === "fence") return p.level === "compressed" ? b.text : "";
  if (b.kind === "text") {
    const short = compressProse(b.text);
    if (p.level === "compressed") return short;
    return p.level === "lead" ? firstSentence(short) : "";
  }
  return "";
}
function renderItem(item, p, level) {
  const body = compressProse(item.body);
  const fullLabel = item.label ? compressProse(item.label) : null;
  const shortLabel = item.id ?? (fullLabel ? fullLabel.replace(/\s*\([^)]*\)\s*$/, "") : null);
  const lead = (label, text) => `- ${label ? `${label}${/[?!]$/.test(label) ? " " : ": "}` : ""}${text}`.trimEnd();
  switch (level) {
    case "compressed":
      return lead(fullLabel, body);
    case "lead": {
      const until = p.role === "questions" ? sentenceStarting(body, /Until decided:/i) : null;
      const first = firstSentence(body);
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
function truncateWords(text, n) {
  const words2 = text.split(/\s+/);
  return words2.length <= n ? text : `${words2.slice(0, n).join(" ")}\u2026`;
}

// src/check.ts
var REQUIRED = ["Product Summary", "Scope", "Acceptance Criteria"];
var SAME_SCOPE = 0.6;
function checkSpecs(opts) {
  const findings = [];
  const product = parseSpec(opts.product.markdown);
  findings.push(...structure(opts.product.path, product));
  const productIds = specIds(product);
  const productOut = [...scopeList(product, "out"), ...scopeList(product, "cut")];
  for (const m of opts.missions ?? []) {
    if (m.path === opts.product.path) continue;
    const mission = parseSpec(m.markdown);
    findings.push(...structure(m.path, mission));
    const own = specIds(mission);
    const body = mission.sections.map((s) => s.raw).join("\n");
    for (const id of referencedIds(body)) {
      if (!own.has(id) && !productIds.has(id) && /^(D|Q)-\d+$/.test(id)) {
        findings.push({ level: "warning", path: m.path, message: `Refers to ${id}, which neither it nor the product spec (${opts.product.path}) defines.` });
      }
    }
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
function structure(path3, spec) {
  const out = [];
  const headings = new Set(spec.sections.map((s) => s.heading.toLowerCase()));
  for (const h of REQUIRED) if (!headings.has(h.toLowerCase())) out.push({ level: "error", path: path3, message: `Has no "## ${h}" section.` });
  const seen = /* @__PURE__ */ new Map();
  for (const s of spec.sections) {
    for (const b of s.blocks) {
      const ids = b.kind === "item" ? b.item.id ? [b.item.id] : [] : b.kind === "fence" ? [...b.text.matchAll(/^\s*-?\s*id:\s*["']?([A-Z]{1,4}-\d+)/gm)].map((m) => m[1]) : [];
      for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
    }
  }
  for (const [id, n] of seen) if (n > 1) out.push({ level: "error", path: path3, message: `Defines ${id} ${n} times.` });
  return out;
}
var STOP = new Set("a an the and or of to in on for with by is are be it its this that as at from not no only any all each into than then them they their which who".split(" "));
function words(text) {
  return new Set(text.toLowerCase().match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)).map(stem) ?? []);
}
function stem(w) {
  const s = w.replace(/(?:ing|ed|es|s)$/, "");
  return (s.length >= 3 ? s : w).replace(/(.)\1$/, "$1");
}
function similarity(a, b) {
  const x = words(a);
  const y = words(b);
  if (Math.min(x.size, y.size) < 3) return 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared++;
  return shared / Math.min(x.size, y.size);
}

// src/config.ts
import fs from "node:fs";
import path from "node:path";
var DEFAULT_BUDGET = 6e3;
function loadConfig(root, file = "cavespec.json") {
  const at = path.join(root, file);
  const raw = fs.existsSync(at) ? JSON.parse(fs.readFileSync(at, "utf8")) : {};
  const all = findFiles(root, ["*.product-spec.md", "docs/**/*.product-spec.md"]);
  const product = raw.product ?? (all.length === 1 ? all[0] : all.find((f) => !f.includes("/missions/")));
  if (!product) throw new Error(`No product spec found. Add cavespec.json with "product": "<path to your *.product-spec.md>".`);
  const patterns = raw.missions ? Array.isArray(raw.missions) ? raw.missions : [raw.missions] : null;
  const missions = (patterns ? findFiles(root, patterns) : all).filter((f) => f !== product);
  return { product, missions, budget: raw.budget ?? DEFAULT_BUDGET, keep: raw.keep ?? [] };
}
function findFiles(root, patterns) {
  const res = patterns.map(toRegExp);
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) walk(rel);
      else if (res.some((r) => r.test(rel))) out.push(rel);
    }
  };
  walk("");
  return out.sort();
}
function toRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      re += pattern[i + 2] === "/" ? "(?:.*/)?" : ".*";
      i += pattern[i + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// src/measure.ts
function measureCut(markdown, cutChars) {
  const text = markdown.replace(/\r\n/g, "\n");
  const spec = parseSpec(text);
  const sections = spec.sections.map((s) => {
    const start = text.indexOf(s.raw);
    const seen = Math.max(0, Math.min(start + s.raw.length, cutChars) - start);
    return { heading: s.heading, chars: s.raw.length, seenPercent: s.raw.length ? Math.round(100 * Math.min(seen, s.raw.length) / s.raw.length) : 100 };
  });
  return { chars: text.length, tokens: estimateTokens(text), cutChars, cutTokens: estimateTokens(text.slice(0, cutChars)), sections };
}

// src/cli.ts
var HELP = `cavespec: keep coding agents on two levels of intent, product and mission, in few tokens.

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
async function main(argv, out = process.stdout, err = process.stderr) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  if (!command || command === "help" || flags.help) {
    out.write(`${HELP}
`);
    return command ? 0 : 1;
  }
  const root = path2.resolve(String(flags.root ?? "."));
  let config;
  try {
    config = flags.product ? { product: String(flags.product), missions: [], budget: DEFAULT_BUDGET, keep: [] } : loadConfig(root, String(flags.config ?? "cavespec.json"));
  } catch (e) {
    err.write(`${e.message}
`);
    return 2;
  }
  const budget = flags.budget ? Number(flags.budget) : config.budget;
  const keep = flags.keep ? String(flags.keep).split(",").map((k) => k.trim()).filter(Boolean) : config.keep;
  const read = (p) => ({ path: p, markdown: fs2.readFileSync(path2.join(root, p), "utf8") });
  const product = read(config.product);
  const mission = flags.mission ? read(String(flags.mission)) : null;
  if (command === "handoff") {
    const h = buildHandoff({ product, mission, budgetTokens: budget, keep });
    out.write(flags.json ? `${JSON.stringify(h, null, 2)}
` : h.text);
    if (!h.fits) err.write(`cavespec: about ${h.tokens} tokens, over the ${budget} budget with nothing left to shorten.
`);
    return 0;
  }
  if (command === "measure") {
    const h = buildHandoff({ product, mission, budgetTokens: budget, keep });
    const cut = measureCut(product.markdown, budget * 4);
    if (flags.json) {
      out.write(`${JSON.stringify({ cut, handoff: { tokens: h.tokens, budgetTokens: h.budgetTokens, fits: h.fits, sections: h.sections } }, null, 2)}
`);
      return 0;
    }
    out.write(`${product.path}: ${cut.chars} characters, about ${cut.tokens} tokens.
`);
    out.write(`A plain cut at ${cut.cutChars} characters (about ${cut.cutTokens} tokens) vs the cavespec handoff (about ${h.tokens} of ${budget} tokens):

`);
    const rows = [["Section", "Chars", "Cut keeps", "Handoff"]];
    for (const s of cut.sections) {
      const hs = h.sections.find((x) => x.spec === "product" && x.heading === s.heading);
      rows.push([s.heading, String(s.chars), `${s.seenPercent}%`, hs ? describe(hs) : "-"]);
    }
    if (mission) for (const hs of h.sections.filter((x) => x.spec === "mission")) rows.push([`(mission) ${hs.heading}`, String(hs.chars), "-", describe(hs)]);
    out.write(`${table(rows)}
`);
    return 0;
  }
  if (command === "check") {
    const missions = (flags.mission ? [String(flags.mission)] : config.missions).map(read);
    const findings = [...await validateWithProductSpec([product, ...missions]), ...checkSpecs({ product, missions, budgetTokens: budget, keep })];
    if (flags.json) out.write(`${JSON.stringify(findings, null, 2)}
`);
    else if (!findings.length) out.write(`cavespec: ${1 + missions.length} spec${missions.length ? "s" : ""} checked, nothing to fix.
`);
    else for (const f of findings) out.write(`${f.level}: ${f.path}: ${f.message}
`);
    return findings.some((f) => f.level === "error") ? 1 : 0;
  }
  err.write(`Unknown command "${command}".

${HELP}
`);
  return 1;
}
function describe(s) {
  if (s.level === "verbatim") return "word for word";
  if (s.level === "pointer") return "one line";
  const items = Object.entries(s.items).filter(([, n]) => n);
  const what = items.length ? items.map(([l, n]) => `${n} ${LEVEL_WORDS[l] ?? l}`).join(", ") : LEVEL_WORDS[s.level] ?? s.level;
  return `${what} (${s.handoffChars} chars)`;
}
var LEVEL_WORDS = { compressed: "shortened", lead: "first sentence", label: "name only", verbatim: "word for word" };
async function validateWithProductSpec(specs) {
  let validate;
  try {
    const name = "@productspec/parser";
    validate = (await import(name)).validateProductSpecMarkdown;
  } catch {
    return [];
  }
  if (!validate) return [];
  const check = validate;
  return specs.flatMap((s) => {
    const r = check(s.markdown);
    return r.valid ? [] : (r.errors ?? [{ message: "isn't a valid ProductSpec" }]).map((e) => ({ level: "error", path: s.path, message: `ProductSpec: ${e.message}` }));
  });
}
function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=", 2);
    if (v !== void 0) flags[k] = v;
    else if (args[i + 1] && !args[i + 1].startsWith("--")) flags[k] = args[++i];
    else flags[k] = true;
  }
  return flags;
}
function table(rows) {
  const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  return rows.map((r, i) => r.map((cell, c) => cell.padEnd(widths[c])).join("  ").trimEnd() + (i === 0 ? `
${widths.map((w) => "-".repeat(w)).join("  ")}` : "")).join("\n");
}

// src/bin.ts
main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`cavespec: ${err instanceof Error ? err.message : String(err)}
`);
    process.exit(2);
  }
);
