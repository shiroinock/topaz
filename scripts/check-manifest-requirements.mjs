#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  collectManifestRequirements,
  collectManifestRequirementsForEntry,
} from "../dist/manifest_requirements.js";

const fixtureDir = path.resolve("build/manifest_requirements");
const fixturePath = path.join(fixtureDir, "main.ts");
const pureFixturePath = path.join(fixtureDir, "pure.ts");

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
writeFileSync(
  pureFixturePath,
  [
    'import { join } from "std/path";',
    "",
    'const out = join("build", "pure.txt");',
    "out;",
    "",
  ].join("\n"),
);

const requirements = collectManifestRequirementsForEntry(fixturePath);
const pureRequirements = collectManifestRequirementsForEntry(pureFixturePath);
const emptyRequirements = collectManifestRequirements([]);
const relFixturePath = path.relative(process.cwd(), fixturePath);
const outputLines = ["manifest requirements ok:"];
for (const requirement of requirements) {
  outputLines.push(`  ${requirement.effect}: ${requirement.occurrences.length} occurrence(s)`);
  for (const occurrence of requirement.occurrences) {
    outputLines.push(
      `    ${path.relative(process.cwd(), occurrence.file)}:${occurrence.line}:${occurrence.col} ` +
        `${occurrence.source} ${occurrence.semanticName} ${occurrence.status} - ${occurrence.detail}`,
    );
  }
}
outputLines.push(`pure requirements: ${pureRequirements.length === 0 ? "none" : String(pureRequirements.length)}`);
outputLines.push(`empty requirements: ${emptyRequirements.length === 0 ? "none" : String(emptyRequirements.length)}`);
const output = outputLines.join("\n");

const errors = [];
const expectedCounts = new Map([
  ["fs.read", 2],
  ["fs.write", 2],
  ["process.argv", 1],
  ["io.stdout", 1],
  ["io.stderr", 3],
]);
const expectedOrder = ["fs.read", "fs.write", "process.argv", "io.stdout", "io.stderr"];

if (!output.startsWith("manifest requirements ok:\n")) {
  errors.push("missing ok heading");
}
if (requirements.length !== expectedOrder.length) {
  errors.push(`expected ${expectedOrder.length} requirement groups, got ${requirements.length}`);
}
for (let i = 0; i < expectedOrder.length; i++) {
  const requirement = requirements[i];
  const expectedEffect = expectedOrder[i];
  if (requirement === undefined) {
    errors.push(`missing requirement group ${expectedEffect}`);
    continue;
  }
  if (requirement.effect !== expectedEffect) {
    errors.push(`requirement group ${i + 1} expected ${expectedEffect}, got ${requirement.effect}`);
  }
  const expectedCount = expectedCounts.get(expectedEffect);
  if (expectedCount !== undefined && requirement.occurrences.length !== expectedCount) {
    errors.push(
      `requirement group ${expectedEffect} expected ${expectedCount} occurrences, got ${requirement.occurrences.length}`,
    );
  }
}
if (!output.includes(`${relFixturePath}:6:14 call fs.readFileSync public - readFileSync(...)`)) {
  errors.push("missing file:line:col occurrence detail");
}
if (!output.includes("console.warn(...)")) {
  errors.push("missing console.warn detail");
}
for (const pureName of ["path.join", "std/path", "join(...)"]) {
  if (output.includes(pureName)) {
    errors.push(`pure std/path detail leaked into requirements: ${pureName}`);
  }
}
if (pureRequirements.length !== 0) {
  errors.push("pure std/path fixture produced requirements");
}
if (emptyRequirements.length !== 0) {
  errors.push("empty provenance produced requirements");
}

if (errors.length !== 0) {
  console.error("manifest requirements check failed:");
  for (const error of errors) console.error(`  ${error}`);
  console.error("observed requirements:");
  for (const line of outputLines) console.error(`  ${line}`);
  process.exit(1);
}

console.log(output);
