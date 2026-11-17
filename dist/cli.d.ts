interface Output {
    write(text: string): unknown;
}
export declare function main(argv: string[], out?: Output, err?: Output): Promise<number>;
export {};
