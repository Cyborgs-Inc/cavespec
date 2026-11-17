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
export type SpecBlock = {
    kind: "text";
    text: string;
} | {
    kind: "fence";
    info: string;
    text: string;
} | {
    kind: "item";
    item: SpecItem;
};
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
/** Splits a spec's markdown into front matter, sections and items. */
export declare function parseSpec(markdown: string): Spec;
/** Ids defined in a spec: list items with ids, and `- id: AC-1` entries in fenced blocks. */
export declare function specIds(spec: Spec): Set<string>;
/** Ids a text refers to (D-5, AC-12), in order of first mention. */
export declare function referencedIds(text: string): string[];
/** The lines under `in:`, `out:` or `cut:` in a spec's scope block. */
export declare function scopeList(spec: Spec, key: "in" | "out" | "cut"): string[];
