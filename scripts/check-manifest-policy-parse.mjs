#!/usr/bin/env node
import { parseManifestPolicyText } from "../dist/manifest_policy.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function diagnosticMessages(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.message).join("; ");
}

function assertAccepted(label, text, expectedCapabilities) {
  const result = parseManifestPolicyText(text);
  assert(result.ok, `${label}: expected accepted policy, got ${diagnosticMessages(result)}`);
  assert(
    result.policy.capabilities.join(",") === expectedCapabilities.join(","),
    `${label}: expected '${expectedCapabilities.join(",")}', got '${result.policy.capabilities.join(",")}'`,
  );
  return result;
}

function assertRejected(label, text, expectedMessage) {
  const result = parseManifestPolicyText(text);
  assert(!result.ok, `${label}: expected rejected policy`);
  assert(
    diagnosticMessages(result) === expectedMessage,
    `${label}: expected diagnostic '${expectedMessage}', got '${diagnosticMessages(result)}'`,
  );
  return result;
}

try {
  const valid = assertAccepted(
    "valid capabilities",
    '{ "capabilities": ["fs.read", "io.stdout"] }',
    ["fs.read", "io.stdout"],
  );
  const emptyObject = assertAccepted("empty object", "{}", []);
  const emptyArray = assertAccepted("empty capabilities", '{ "capabilities": [] }', []);
  const extraKeys = assertAccepted(
    "extra top-level keys",
    '{ "name": "demo", "future": [{ "enabled": true }, false, null, -12.5e+2], "capabilities": ["fs.read"] }',
    ["fs.read"],
  );
  const escaped = assertAccepted(
    "escaped strings",
    '{ "note": "quote: \\" slash: \\/ backslash: \\\\ newline: \\n", "capabilities": ["fs.read"] }',
    ["fs.read"],
  );

  const invalidSyntax = assertRejected("invalid top-level syntax", "{", "expected string");
  const nonObject = assertRejected("non-object top-level", "[]", "top-level value must be an object");
  const nonArray = assertRejected("non-array capabilities", '{ "capabilities": "fs.read" }', "'capabilities' must be an array");
  const nonStringEntry = assertRejected(
    "non-string capability",
    '{ "capabilities": ["fs.read", 1] }',
    "'capabilities' entries must be strings",
  );
  const duplicateKey = assertRejected(
    "duplicate capabilities key",
    '{ "capabilities": [], "capabilities": [] }',
    "duplicate top-level key 'capabilities'",
  );
  const unicodeEscape = assertRejected(
    "unicode escape",
    '{ "capabilities": ["fs\\u002eread"] }',
    "unicode escapes are unsupported in strict-ts.json",
  );
  const invalidNumber = assertRejected(
    "invalid skipped number",
    '{ "future": 012 }',
    "invalid number",
  );
  const unknown = assertRejected(
    "unknown capability",
    '{ "capabilities": ["fs.delete"] }',
    "unknown capability 'fs.delete'",
  );
  const duplicate = assertRejected(
    "duplicate capability",
    '{ "capabilities": ["fs.read", "io.stdout", "fs.read"] }',
    "duplicate capability 'fs.read'",
  );

  console.log("manifest policy parse ok:");
  console.log(`  valid capabilities: ${valid.policy.capabilities.join(", ")}`);
  console.log(`  empty object: ${emptyObject.policy.capabilities.length === 0 ? "none" : "unexpected"}`);
  console.log(`  empty capabilities: ${emptyArray.policy.capabilities.length === 0 ? "none" : "unexpected"}`);
  console.log(`  extra keys ignored: ${extraKeys.policy.capabilities.join(", ")}`);
  console.log(`  escaped string skip: ${escaped.policy.capabilities.join(", ")}`);
  console.log(`  invalid syntax diagnostic: ${invalidSyntax.diagnostics[0].message}`);
  console.log(`  non-object diagnostic: ${nonObject.diagnostics[0].message}`);
  console.log(`  non-array diagnostic: ${nonArray.diagnostics[0].message}`);
  console.log(`  non-string diagnostic: ${nonStringEntry.diagnostics[0].message}`);
  console.log(`  duplicate key diagnostic: ${duplicateKey.diagnostics[0].message}`);
  console.log(`  unicode escape diagnostic: ${unicodeEscape.diagnostics[0].message}`);
  console.log(`  invalid number diagnostic: ${invalidNumber.diagnostics[0].message}`);
  console.log(`  unknown diagnostic: ${unknown.diagnostics[0].message}`);
  console.log(`  duplicate diagnostic: ${duplicate.diagnostics[0].message}`);
} catch (err) {
  console.error("manifest policy parse check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
