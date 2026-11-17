export interface CutReport {
    chars: number;
    tokens: number;
    cutChars: number;
    cutTokens: number;
    sections: {
        heading: string;
        chars: number;
        seenPercent: number;
    }[];
}
export declare function measureCut(markdown: string, cutChars: number): CutReport;
