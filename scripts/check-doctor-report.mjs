#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { formatDoctorReportForEntry } from "../dist/doctor_report.js";

const fixtureDir = "build/doctor_report";
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

const report = formatDoctorReportForEntry(fixturePath);
const pureReport = formatDoctorReportForEntry(pureFixturePath);
const errors = [];

if (!report.startsWith(`topaz doctor report: ${fixturePath}\n`)) {
  errors.push("doctor report heading does not contain the fixture path");
}
for (const summary of ["fs.read: 2", "fs.write: 2", "process.argv: 1", "io.stdout: 1", "io.stderr: 3"]) {
  if (!report.includes(`  ${summary}`)) {
    errors.push(`missing capability summary: ${summary}`);
  }
}
if (!report.includes(`${fixturePath}:6:14 [fs.read] fs.readFileSync via call public - readFileSync(...)`)) {
  errors.push("missing file:line:col doctor occurrence");
}
if (!report.includes("console.warn(...)")) {
  errors.push("missing console.warn detail");
}
for (const pureName of ["path.join", "std/path", "join(...)"]) {
  if (report.includes(pureName)) {
    errors.push(`pure std/path detail leaked into doctor report: ${pureName}`);
  }
}
if (pureReport !== `topaz doctor report: ${pureFixturePath}\ncapabilities: none\nrequirements: none`) {
  errors.push("pure std/path fixture did not render the empty doctor report contract");
}

if (errors.length !== 0) {
  console.error("doctor report check failed:");
  for (const error of errors) console.error(`  ${error}`);
  console.error("observed report:");
  for (const line of report.split("\n")) console.error(`  ${line}`);
  console.error("observed pure report:");
  for (const line of pureReport.split("\n")) console.error(`  ${line}`);
  process.exit(1);
}

console.log("doctor report ok:");
console.log(report);
console.log(pureReport);
