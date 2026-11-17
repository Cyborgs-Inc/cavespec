export interface Config {
    product: string;
    missions: string[];
    budget: number;
    keep: string[];
}
export declare const DEFAULT_BUDGET = 6000;
export declare function loadConfig(root: string, file?: string): Config;
/** Files under root matching any pattern ("*" within a folder, "**" across folders), as root-relative paths. */
export declare function findFiles(root: string, patterns: string[]): string[];
