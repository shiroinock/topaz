#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkManifestPolicyForEntry,
  formatManifestCheckReport,
} from "../dist/manifest_check.js";

const FIXTURE_DIR = "build/manifest_check";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function writeFixture(name, text) {
  const path = join(FIXTURE_DIR, name);
  writeFileSync(path, text);
  return path;
}

function assertReportIncludes(label, report, text) {
  assert(report.includes(text), `${label}: missing '${text}' in report:\n${report}`);
}

function assertReportExcludes(label, report, text) {
  assert(!report.includes(text), `${label}: unexpected '${text}' in report:\n${report}`);
}

function check(label, entry, policyPath) {
  const result = checkManifestPolicyForEntry(entry, policyPath);
  const report = formatManifestCheckReport(result);
  return { result, report };
}

try {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const effectfulEntry = writeFixture(
    "main.ts",
    [
      'import { readFileSync, writeFileSync } from "std/fs";',
      "",
      'const data = readFileSync("input.txt", "utf8");',
      'writeFileSync("build/manifest_check/out.txt", data);',
      "console.log(data);",
      "console.warn(data);",
      "",
    ].join("\n"),
  );
  const pureEntry = writeFixture(
    "pure.ts",
    [
      'import { join } from "std/path";',
      "",
      'const out = join("build", "pure.txt");',
      "out;",
      "",
    ].join("\n"),
  );

  const missingPolicy = join(FIXTURE_DIR, "missing-strict-ts.json");
  const fullPolicy = writeFixture(
    "full-strict-ts.json",
    '{ "capabilities": ["fs.read", "fs.write", "io.stdout", "io.stderr"] }',
  );
  const partialPolicy = writeFixture(
    "partial-strict-ts.json",
    '{ "capabilities": ["fs.read", "io.stdout"] }',
  );
  const invalidPolicy = writeFixture("invalid-strict-ts.json", "[]");
  const unknownPolicy = writeFixture("unknown-strict-ts.json", '{ "capabilities": ["fs.delete"] }');

  const pureMissing = check("pure missing policy", pureEntry, missingPolicy);
  assert(pureMissing.result.ok, "pure missing policy: expected ok result");
  assertReportIncludes("pure missing policy", pureMissing.report, `topaz check report: ${pureEntry}`);
  assertReportIncludes("pure missing policy", pureMissing.report, `policy: ${missingPolicy} (missing)`);
  assertReportIncludes("pure missing policy", pureMissing.report, "missing capabilities: none");
  assertReportIncludes("pure missing policy", pureMissing.report, "status: ok");

  const effectfulMissing = check("effectful missing policy", effectfulEntry, missingPolicy);
  assert(!effectfulMissing.result.ok, "effectful missing policy: expected failed result");
  assertReportIncludes("effectful missing policy", effectfulMissing.report, `policy: ${missingPolicy} (missing)`);
  assertReportIncludes("effectful missing policy", effectfulMissing.report, "  fs.read: ");
  assertReportIncludes("effectful missing policy", effectfulMissing.report, "  fs.write: ");
  assertReportIncludes("effectful missing policy", effectfulMissing.report, "  io.stdout: ");
  assertReportIncludes("effectful missing policy", effectfulMissing.report, "  io.stderr: ");
  assertReportIncludes("effectful missing policy", effectfulMissing.report, "status: failed");

  const full = check("full policy", effectfulEntry, fullPolicy);
  assert(full.result.ok, "full policy: expected ok result");
  assertReportIncludes("full policy", full.report, `policy: ${fullPolicy} (found)`);
  assertReportIncludes("full policy", full.report, "missing capabilities: none");
  assertReportIncludes("full policy", full.report, "status: ok");

  const partial = check("partial policy", effectfulEntry, partialPolicy);
  assert(!partial.result.ok, "partial policy: expected failed result");
  assertReportIncludes("partial policy", partial.report, "  fs.write: ");
  assertReportIncludes("partial policy", partial.report, "  io.stderr: ");
  assertReportExcludes("partial policy", partial.report, "  fs.read: ");
  assertReportExcludes("partial policy", partial.report, "  io.stdout: ");
  assertReportIncludes("partial policy", partial.report, "status: failed");

  const invalid = check("invalid policy", effectfulEntry, invalidPolicy);
  assert(!invalid.result.ok, "invalid policy: expected failed result");
  assertReportIncludes("invalid policy", invalid.report, "top-level value must be an object");
  assertReportIncludes("invalid policy", invalid.report, "status: failed");

  const unknown = check("unknown policy", effectfulEntry, unknownPolicy);
  assert(!unknown.result.ok, "unknown policy: expected failed result");
  assertReportIncludes("unknown policy", unknown.report, "unknown capability 'fs.delete'");
  assertReportIncludes("unknown policy", unknown.report, "status: failed");

  console.log("manifest check ok:");
  console.log(`  pure missing policy: ${pureMissing.result.ok ? "ok" : "failed"}`);
  console.log(`  effectful missing policy: ${effectfulMissing.result.ok ? "ok" : "failed"}`);
  console.log(`  full policy: ${full.result.ok ? "ok" : "failed"}`);
  console.log(`  partial policy: missing ${partial.result.missing.map((issue) => issue.capability).join(", ")}`);
  console.log(`  invalid diagnostic: ${invalid.result.policyDiagnostics[0].message}`);
  console.log(`  unknown diagnostic: ${unknown.result.policyDiagnostics[0].message}`);
} catch (err) {
  console.error("manifest check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
