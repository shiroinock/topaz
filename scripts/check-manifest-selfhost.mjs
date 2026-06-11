#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT_DIR = "build/manifest_selfhost";
const TARGETS = [
  {
    source: "src/manifest_requirements.ts",
    output: `${OUT_DIR}/manifest_requirements`,
    formerBlocker: "Map<string, Array<...>> monomorph blocker",
  },
  {
    source: "src/manifest_policy.ts",
    output: `${OUT_DIR}/manifest_policy`,
    formerBlocker: "capability policy array validator + text parser + file loader",
  },
];

function run(command, args) {
  execFileSync(command, args, { stdio: "pipe" });
}

try {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const target of TARGETS) {
    run("node", ["dist/cli.js", target.source, "--emit-c-only", "-o", target.output]);
    run("cc", ["-O2", "-Iruntime", "-Wall", "-Wextra", "-c", `${target.output}.c`, "-o", `${target.output}.o`]);
  }
} catch (err) {
  console.error("manifest selfhost check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log("manifest selfhost ok:");
for (const target of TARGETS) {
  console.log(`  ${target.source} -> ${target.output}.c (${target.formerBlocker} cleared)`);
}
