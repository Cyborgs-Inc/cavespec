export type Level = "verbatim" | "compressed" | "lead" | "label" | "pointer";
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
/** Builds the two-level handoff for an agent turn. */
export declare function buildHandoff(opts: HandoffOptions): Handoff;
