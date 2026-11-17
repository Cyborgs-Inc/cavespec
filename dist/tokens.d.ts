/**
 * Estimated tokens for a text: about four characters per token, which is close for English prose and Markdown on
 * current Claude, GPT and Gemini tokenizers. An estimate, not a count: say so wherever it's shown.
 */
export declare function estimateTokens(text: string): number;
