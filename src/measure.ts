import { parseSpec } from "./spec";
import { estimateTokens } from "./tokens";

// What an agent sees when a spec is cut at a character limit, the usual way of fitting one in: per section, how much
// survives. The baseline a handoff is compared with.

export interface CutReport {
  chars: number;
  tokens: number;
  cutChars: number;
  cutTokens: number;
  sections: { heading: string; chars: number; seenPercent: number }[];
}

export function measureCut(markdown: string, cutChars: number): CutReport {
  const text = markdown.replace(/\r\n/g, "\n");
  const spec = parseSpec(text);
  const sections = spec.sections.map((s) => {
    const start = text.indexOf(s.raw);
    const seen = Math.max(0, Math.min(start + s.raw.length, cutChars) - start);
    return { heading: s.heading, chars: s.raw.length, seenPercent: s.raw.length ? Math.round((100 * Math.min(seen, s.raw.length)) / s.raw.length) : 100 };
  });
  return { chars: text.length, tokens: estimateTokens(text), cutChars, cutTokens: estimateTokens(text.slice(0, cutChars)), sections };
}
