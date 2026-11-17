import { type HandoffSpecInput } from "./handoff";
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
export declare function checkSpecs(opts: CheckOptions): Finding[];
/** Shared content words over the smaller set: 1 when one line's words are all in the other. */
export declare function similarity(a: string, b: string): number;
