#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT_DIR = "build/effect_selfhost";
const TARGETS = [
  {
    source: "src/effect_provenance.ts",
    output: `${OUT_DIR}/effect_provenance`,
    formerBlocker: "unknown template escape",
  },
  {
    source: "src/effect_report.ts",
    output: `${OUT_DIR}/effect_report`,
    formerBlocker: "default import from stdlib specifier 'node:path'",
  },
];

function run(command, args) {
  execFileSync(command, args, { stdio: "pipe" });
}

function checkTarget(target) {
  run("node", ["dist/cli.js", target.source, "--emit-c-only", "-o", target.output]);
  run("cc", ["-O2", "-Iruntime", "-Wall", "-Wextra", "-c", `${target.output}.c`, "-o", `${target.output}.o`]);
}

try {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const target of TARGETS) checkTarget(target);
} catch (err) {
  console.error("effect selfhost check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

console.log("effect selfhost ok:");
for (const target of TARGETS) {
  console.log(`  ${target.source} -> ${target.output}.c (${target.formerBlocker} cleared)`);
}
