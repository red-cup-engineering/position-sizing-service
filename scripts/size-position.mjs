#!/usr/bin/env node
/**
 * CLI/import face for `sizePosition` (see `../src/sleeve.mjs` for the algebra). Reads NDJSON
 * requests on stdin and writes one sizing or refusal record per line to stdout; `--help` prints
 * this operation's summary.
 */

import { sizePosition } from "../src/sleeve.mjs";

export { sizePosition };

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write("sizePosition — Sizes one position against a bounded, walled risk sleeve, full Kelly by default, refusing rather than sizing when liability, edge sign, or the sleeve's own capital forbids it; also reports the sleeve's declared collapse stage and, when a joule-denominated barrier is declared, its USD figure compared against survivalCapital.\n");
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(sizePosition(JSON.parse(line)))}\n`);
    }
  }
}
