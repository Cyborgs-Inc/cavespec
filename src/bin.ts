#!/usr/bin/env node
import { main } from "./cli";

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`cavespec: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  },
);
