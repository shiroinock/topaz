#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { collectBuiltinEffectProvenanceForEntry } from "../dist/effect_provenance.js";

const fixtureDir = path.resolve("build/effect_provenance");
const fixturePath = path.join(fixtureDir, "main.ts");

mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  fixturePath,
  [
    'import { readFileSync, writeFileSync } from "std/fs";',
    'import { writeError } from "std/process";',
    'import { join } from "std/path";',
    "",
    "const args = process.argv;",
    'const data = readFileSync("input.txt", "utf8");',
    'writeFileSync(join("build", "out.txt"), data);',
    "writeError(data);",
    "console.log(data);",
    "console.warn(data);",
    "join(args[0], data);",
    "",
  ].join("\n"),
);

const provenance = collectBuiltinEffectProvenanceForEntry(fixturePath);
const relFixturePath = path.relative(process.cwd(), fixturePath);
const lines = provenance.map((entry) =>
  [
    `${path.relative(process.cwd(), entry.file)}:${entry.line}:${entry.col}`,
    entry.source,
    entry.effect,
    entry.semanticName,
    entry.detail,
  ].join(" | "),
);

const expectedLines = [
  `${relFixturePath}:1:10 | import | fs.read | fs.readFileSync | import { readFileSync } from "std/fs"`,
  `${relFixturePath}:1:24 | import | fs.write | fs.writeFileSync | import { writeFileSync } from "std/fs"`,
  `${relFixturePath}:2:10 | import | io.stderr | console.error | import { writeError } from "std/process"`,
  `${relFixturePath}:5:14 | value | process.argv | process.argv | process.argv`,
  `${relFixturePath}:6:14 | call | fs.read | fs.readFileSync | readFileSync(...)`,
  `${relFixturePath}:7:1 | call | fs.write | fs.writeFileSync | writeFileSync(...)`,
  `${relFixturePath}:8:1 | call | io.stderr | console.error | writeError(...)`,
  `${relFixturePath}:9:1 | call | io.stdout | console.log | console.log(...)`,
  `${relFixturePath}:10:1 | call | io.stderr | console.error | console.warn(...)`,
];

const errors = [];
if (lines.length !== expectedLines.length) {
  errors.push(`expected ${expectedLines.length} provenance lines, got ${lines.length}`);
}
for (let i = 0; i < expectedLines.length; i++) {
  if (lines[i] !== expectedLines[i]) {
    errors.push(`line ${i + 1} mismatch:\n  expected: ${expectedLines[i]}\n       got: ${lines[i] ?? "<missing>"}`);
  }
}
for (const pureName of ["path.join", "std/path", "join(...)"]) {
  if (lines.some((line) => line.includes(pureName))) {
    errors.push(`pure std/path call leaked into provenance: ${pureName}`);
  }
}
if (!lines.some((line) => line.includes("console.warn(...)"))) {
  errors.push("missing console.warn detail");
}

if (errors.length !== 0) {
  console.error("effect provenance check failed:");
  for (const error of errors) console.error(`  ${error}`);
  console.error("observed provenance:");
  for (const line of lines) console.error(`  ${line}`);
  process.exit(1);
}

console.log(`effect provenance ok: ${lines.length} records`);
for (const line of lines) console.log(`  ${line}`);
