// A ProductSpec (https://github.com/gokulrajaram/ProductSpec) split into the parts a handoff needs: its front matter,
// its sections, and the list items inside them with their ids (AC-1, D-5, Q-8) and bold labels. Parsing is
// deliberately forgiving: anything it doesn't recognize stays as text, so nothing in a spec is ever lost.

export interface SpecItem {
  /** The item's id when its label or body starts with one: AC-1, D-5, Q-8, M-2. */
  id: string | null;
  /** The bold lead-in, without its asterisks or trailing colon: "D-5 (2026-10-31, Arjun)", "Admin panel". */
  label: string | null;
  /** The item's text after the label, its continuation lines joined. */
  body: string;
  /** The item exactly as written. */
  raw: string;
}

export type SpecBlock = { kind: "text"; text: string } | { kind: "fence"; info: string; text: string } | { kind: "item"; item: SpecItem };

export interface SpecSection {
  heading: string;
  /** Heading depth: 2 for "##". */
  depth: number;
  blocks: SpecBlock[];
  /** The section exactly as written, heading included. */
  raw: string;
}

export interface Spec {
  /** Front matter fields that are plain scalars (title, spec_revision, ...). */
  meta: Record<string, string>;
  /** The front matter block as written, fences included; empty when there is none. */
  frontMatter: string;
  /** Text before the first section. */
  preamble: string;
  sections: SpecSection[];
}

const ID = /^(?:[A-Z]{1,4}-\d+)\b/;

/** Splits a spec's markdown into front matter, sections and items. */
export function parseSpec(markdown: string): Spec {
  const text = markdown.replace(/\r\n/g, "\n");
  let rest = text;
  let frontMatter = "";
  const meta: Record<string, string> = {};
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
  const sections: SpecSection[] = [];
  const preamble: string[] = [];
  let current: { heading: string; depth: number; lines: string[] } | null = null;
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

function toSection(s: { heading: string; depth: number; lines: string[] }): SpecSection {
  return { heading: s.heading, depth: s.depth, blocks: toBlocks(s.lines.slice(1)), raw: s.lines.join("\n").trimEnd() };
}

/** Paragraphs, fenced blocks and top-level list items, in order. */
function toBlocks(lines: string[]): SpecBlock[] {
  const blocks: SpecBlock[] = [];
  let i = 0;
  const para: string[] = [];
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
      const body: string[] = [line];
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
      // Continuation: indented lines, and blank lines followed by indented ones.
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || (lines[i].trim() === "" && i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])))) itemLines.push(lines[i++]);
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

function toItem(lines: string[]): SpecItem {
  const raw = lines.join("\n");
  const first = lines[0].replace(/^[-*]\s+/, "");
  const joined = [first, ...lines.slice(1).map((l) => l.trim())].filter(Boolean).join(" ");
  const bold = /^\*\*(.+?)\*\*:?\s*/.exec(joined);
  const label = bold ? bold[1].replace(/:\s*$/, "").trim() : null;
  const body = bold ? joined.slice(bold[0].length).trim() : joined.trim();
  const id = (label && ID.exec(label)?.[0]) ?? ID.exec(body)?.[0] ?? null;
  return { id, label, body, raw };
}

/** Ids defined in a spec: list items with ids, and `- id: AC-1` entries in fenced blocks. */
export function specIds(spec: Spec): Set<string> {
  const ids = new Set<string>();
  for (const s of spec.sections) {
    for (const b of s.blocks) {
      if (b.kind === "item" && b.item.id) ids.add(b.item.id);
      if (b.kind === "fence") for (const m of b.text.matchAll(/^\s*-?\s*id:\s*["']?([A-Z]{1,4}-\d+)/gm)) ids.add(m[1]);
    }
  }
  return ids;
}

/** Ids a text refers to (D-5, AC-12), in order of first mention. */
export function referencedIds(text: string): string[] {
  return [...new Set([...text.matchAll(/\b([A-Z]{1,4}-\d+)\b/g)].map((m) => m[1]))];
}

/** The lines under `in:`, `out:` or `cut:` in a spec's scope block. */
export function scopeList(spec: Spec, key: "in" | "out" | "cut"): string[] {
  for (const s of spec.sections) {
    for (const b of s.blocks) {
      if (b.kind !== "fence" || !/scope/i.test(b.info)) continue;
      const out: string[] = [];
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
