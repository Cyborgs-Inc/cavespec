/** Shortens prose. Code spans, quotes, URLs and paths pass through unchanged. */
export declare function compressProse(text: string): string;
/** The first sentence of a text (protected spans don't end sentences). */
export declare function firstSentence(text: string): string;
/** A sentence starting with `lead` (such as "Until decided:"), whole, or null. */
export declare function sentenceStarting(text: string, lead: RegExp): string | null;
