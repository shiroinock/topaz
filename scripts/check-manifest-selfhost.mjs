#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT_DIR = "build/manifest_selfhost";
const TARGET = {
  source: "src/manifest_requirements.ts",
  output: `${OUT_DIR}/manifest_requirements`,
  formerBlocker: "Map<string, Array<...>> monomorph blocker",
};

function run(command, args) {
  execFileSync(command, args, { stdio: "pipe" });
}

try {
  mkdirSync(OUT_DIR, { recursive: true });
  run("node", ["dist/cli.js", TARGET.source, "--emit-c-only", "-o", TARGET.output]);
  run("cc", ["-O2", "-Iruntime", "-Wall", "-Wextra", "-c", `${TARGET.output}.c`, "-o", `${TARGET.output}.o`]);
} catch (err) {
  console.error("manifest selfhost check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log("manifest selfhost ok:");
console.log(`  ${TARGET.source} -> ${TARGET.output}.c (${TARGET.formerBlocker} cleared)`);
