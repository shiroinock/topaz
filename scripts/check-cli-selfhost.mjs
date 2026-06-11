#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT_DIR = "build/cli_selfhost";
const SOURCE = "src/cli.ts";
const OUTPUT = `${OUT_DIR}/topaz`;
const REQUIRED_HELP = [
  "usage: topaz <input.ts>",
  "topaz doctor <entry.ts>",
  "topaz explain capability <name>",
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
} catch (err) {
  console.error("cli selfhost check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log("cli selfhost ok:");
console.log(`  ${SOURCE} -> ${OUTPUT} (--help includes doctor and explain capability)`);
