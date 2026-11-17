// Caveman-style shortening of spec prose (after https://github.com/juliusbrussee/caveman), done without a model so
// the same spec always gives the same handoff: drop filler words and articles, tighten stock phrases, strip
// markdown decoration. What carries meaning exactly is never touched: code spans, quoted text (often UI copy),
// ids like D-5, numbers, paths and URLs.

// Words that change no meaning when dropped. "Still", "already" and "also" stay: they often do.
const FILLER = /\b(?:just|really|very|basically|actually|simply|quite|certainly|definitely|essentially)\b\s*/gi;
// Lowercase articles anywhere; a capital one only where a sentence starts ("Plan A" keeps its A).
const ARTICLES = /\b(?:the|a|an)\s+(?=\S)/g;
const LEADING_ARTICLES = /(^|[.!?:]\s+|\n\s*)(?:The|A|An)\s+(?=\S)/g;
const PHRASES: [RegExp, string][] = [
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
  [/\bcannot\b/gi, "can't"],
];

/** Spans left exactly as written: code, quoted text, URLs, paths. */
const PROTECTED = /`[^`\n]+`|"[^"\n]{1,200}"|“[^”\n]{1,200}”|\bhttps?:\/\/\S+|(?:\.{0,2}\/)?[\w.-]+(?:\/[\w.-]+)+\.\w+/g;

/** Shortens prose. Code spans, quotes, URLs and paths pass through unchanged. */
export function compressProse(text: string): string {
  // Links keep their text; the target is rarely worth its tokens in a handoff.
  let s = text.replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, "$1");
  const kept: string[] = [];
  s = s.replace(PROTECTED, (m) => {
    kept.push(m);
    return `\u0000${kept.length - 1}\u0000`;
  });
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/(^|\s)_([^_\n]+)_(?=\s|$|[.,;:])/g, "$1$2");
  for (const [re, to] of PHRASES) s = s.replace(re, (m) => keepCase(m, to));
  s = s.replace(FILLER, "").replace(ARTICLES, "").replace(LEADING_ARTICLES, "$1");
  s = s
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:)])/g, "$1")
    .replace(/\( +/g, "(")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => kept[Number(i)]).trim();
}

function keepCase(original: string, replacement: string): string {
  return original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

/** The first sentence of a text (protected spans don't end sentences). */
export function firstSentence(text: string): string {
  const masked = text.replace(/`[^`\n]+`|"[^"\n]*"|\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Ms|No)\.|\d\.\d/g, (m) => "\u0001".repeat(m.length));
  const m = /[.!?](?=\s+[A-Z`"(*]|\s*$)/.exec(masked);
  return m ? text.slice(0, m.index + 1).trim() : text.trim();
}

/** A sentence starting with `lead` (such as "Until decided:"), whole, or null. */
export function sentenceStarting(text: string, lead: RegExp): string | null {
  const m = lead.exec(text);
  if (!m) return null;
  return firstSentence(text.slice(m.index));
}
