#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loadManifestPolicyFile } from "../dist/manifest_policy.js";

const FIXTURE_DIR = "build/manifest_policy_load";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function diagnosticMessages(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.message).join("; ");
}

function writeFixture(name, text) {
  const path = join(FIXTURE_DIR, name);
  writeFileSync(path, text);
  return path;
}

function assertMissing(path) {
  const loaded = loadManifestPolicyFile(path);
  assert(!loaded.found, "missing file: expected found=false");
  assert(loaded.path === path, "missing file: path was not preserved");
  assert(loaded.result.ok, `missing file: expected ok result, got ${diagnosticMessages(loaded.result)}`);
  assert(loaded.result.policy.capabilities.length === 0, "missing file: expected empty capabilities");
  assert(loaded.result.diagnostics.length === 0, "missing file: expected empty diagnostics");
  return loaded;
}

function assertAccepted(label, path, expectedCapabilities) {
  const loaded = loadManifestPolicyFile(path);
  assert(loaded.found, `${label}: expected found=true`);
  assert(loaded.path === path, `${label}: path was not preserved`);
  assert(loaded.result.ok, `${label}: expected accepted policy, got ${diagnosticMessages(loaded.result)}`);
  assert(
    loaded.result.policy.capabilities.join(",") === expectedCapabilities.join(","),
    `${label}: expected '${expectedCapabilities.join(",")}', got '${loaded.result.policy.capabilities.join(",")}'`,
  );
  return loaded;
}

function assertRejected(label, path, expectedMessage) {
  const loaded = loadManifestPolicyFile(path);
  assert(loaded.found, `${label}: expected found=true`);
  assert(loaded.path === path, `${label}: path was not preserved`);
  assert(!loaded.result.ok, `${label}: expected rejected policy`);
  assert(
    diagnosticMessages(loaded.result) === expectedMessage,
    `${label}: expected diagnostic '${expectedMessage}', got '${diagnosticMessages(loaded.result)}'`,
  );
  return loaded;
}

try {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const missing = assertMissing(join(FIXTURE_DIR, "missing-strict-ts.json"));
  const emptyObject = assertAccepted("empty object file", writeFixture("empty.json", "{}"), []);
  const valid = assertAccepted(
    "valid capability file",
    writeFixture("valid.json", '{ "capabilities": ["fs.read", "io.stdout"] }'),
    ["fs.read", "io.stdout"],
  );
  const nonObject = assertRejected(
    "non-object file",
    writeFixture("non-object.json", "[]"),
    "top-level value must be an object",
  );
  const unknown = assertRejected(
    "unknown capability file",
    writeFixture("unknown.json", '{ "capabilities": ["fs.delete"] }'),
    "unknown capability 'fs.delete'",
  );
  const duplicateKey = assertRejected(
    "duplicate top-level key file",
    writeFixture("duplicate-key.json", '{ "capabilities": [], "capabilities": [] }'),
    "duplicate top-level key 'capabilities'",
  );

  console.log("manifest policy load ok:");
  console.log(`  missing file: found=${missing.found}, capabilities=${missing.result.policy.capabilities.length}`);
  console.log(`  empty object file: ${emptyObject.result.policy.capabilities.length === 0 ? "none" : "unexpected"}`);
  console.log(`  valid capability file: ${valid.result.policy.capabilities.join(", ")}`);
  console.log(`  non-object diagnostic: ${nonObject.result.diagnostics[0].message}`);
  console.log(`  unknown diagnostic: ${unknown.result.diagnostics[0].message}`);
  console.log(`  duplicate key diagnostic: ${duplicateKey.result.diagnostics[0].message}`);
} catch (err) {
  console.error("manifest policy load check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
