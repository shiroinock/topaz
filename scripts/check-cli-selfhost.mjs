#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT_DIR = "build/cli_selfhost";
const SOURCE = "src/cli.ts";
const OUTPUT = `${OUT_DIR}/topaz`;
const FIB_SOURCE = "examples/fib.ts";
const FIB_OUTPUT = `${OUT_DIR}/fib`;
const FIB_EXPECTED = "5702887";
const REQUIRED_HELP = [
  "usage: topaz <input.ts>",
  "topaz doctor <entry.ts>",
  "topaz explain capability <name>",
  "topaz explain std/<module>",
];

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: "pipe" });
}

try {
  mkdirSync(OUT_DIR, { recursive: true });
  run("node", ["dist/cli.js", SOURCE, "-o", OUTPUT]);
  const helpOut = run(OUTPUT, ["--help"]);
  for (const expected of REQUIRED_HELP) {
    if (!helpOut.includes(expected)) {
      console.error("cli selfhost check failed:");
      console.error(`missing help output fragment: ${expected}`);
      process.exit(1);
    }
  }
  run(OUTPUT, [FIB_SOURCE, "-o", FIB_OUTPUT]);
  const fibOut = run(FIB_OUTPUT, []).replace(/\r?\n$/, "");
  if (fibOut !== FIB_EXPECTED) {
    console.error("cli selfhost check failed:");
    console.error(`expected ${FIB_OUTPUT} stdout ${FIB_EXPECTED}, got ${JSON.stringify(fibOut)}`);
    process.exit(1);
  }
} catch (err) {
  console.error("cli selfhost check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log("cli selfhost ok:");
console.log(`  ${SOURCE} -> ${OUTPUT} (--help includes doctor and explain guidance)`);
console.log(`  ${FIB_SOURCE} -> ${FIB_OUTPUT} (prints ${FIB_EXPECTED})`);
