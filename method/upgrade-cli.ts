// Copyright 2026 Nicholas Koza
// SPDX-License-Identifier: MIT

// railyard-upgrade: carries the repository it is run in forward to this version of the method
// ([o7Y]), and says what it moved and which of the repository's own files still name an old path.
import { decisionsReport } from "./decisions-by-id.ts";
import { carriedReport } from "./tests-by-id.ts";
import { upgrade } from "./upgrade.ts";

const USAGE = "usage: railyard upgrade                           carry this repository forward to this version of the method";

export async function main(argv: readonly string[] = []): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const done = await upgrade(process.cwd());
  if (done.done === "nothing") {
    console.log("Already at this version of the method; nothing to do.");
    return 0;
  }
  if (done.done === "recorded") {
    console.log(`The method had not worked in this repository: recorded it at ${done.version}, in .railyard/method.json.`);
    return 0;
  }
  if (done.done === "refused") {
    console.error(`Not upgraded: ${done.why}`);
    return 1;
  }
  console.log(`Upgraded the method ${done.from} → ${done.to}.`);
  for (const m of done.moved) console.log(`  moved ${m.from} → ${m.to}`);
  if (done.carried !== undefined) process.stdout.write(carriedReport(done.carried, false));
  if (done.decisions !== undefined) process.stdout.write(decisionsReport(done.decisions, false));
  if (done.stillNaming.length > 0) {
    console.log("These files still name an old path. They are yours, so they were left as they are:");
    for (const s of done.stillNaming) console.log(`  ${s.file} still names ${s.old}`);
  }
  return 0;
}
