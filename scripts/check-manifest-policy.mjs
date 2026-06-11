#!/usr/bin/env node
import {
  emptyManifestPolicy,
  manifestPolicyFilename,
  validateManifestPolicyCapabilities,
} from "../dist/manifest_policy.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function diagnosticMessages(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.message).join("; ");
}

function assertAccepted(label, capabilities) {
  const result = validateManifestPolicyCapabilities(capabilities);
  assert(result.ok, `${label}: expected accepted policy, got ${diagnosticMessages(result)}`);
  assert(
    result.policy.capabilities.join(",") === capabilities.join(","),
    `${label}: accepted capabilities must preserve input order`,
  );
  return result;
}

function assertRejected(label, capabilities, expectedMessage) {
  const result = validateManifestPolicyCapabilities(capabilities);
  assert(!result.ok, `${label}: expected rejected policy`);
  assert(
    diagnosticMessages(result) === expectedMessage,
    `${label}: expected diagnostic '${expectedMessage}', got '${diagnosticMessages(result)}'`,
  );
  return result;
}

try {
  assert(manifestPolicyFilename() === "strict-ts.json", "manifest policy filename changed");

  const valid = assertAccepted("valid capabilities", ["fs.read", "io.stdout"]);
  const empty = assertAccepted("empty capabilities", emptyManifestPolicy().capabilities);
  const unknown = assertRejected(
    "unknown capability",
    ["fs.delete"],
    "unknown capability 'fs.delete'",
  );
  const duplicate = assertRejected(
    "duplicate capability",
    ["fs.read", "io.stdout", "fs.read"],
    "duplicate capability 'fs.read'",
  );

  console.log("manifest policy ok:");
  console.log(`  filename: ${manifestPolicyFilename()}`);
  console.log(`  valid capabilities: ${valid.policy.capabilities.join(", ")}`);
  console.log(`  empty capabilities: ${empty.policy.capabilities.length === 0 ? "none" : "unexpected"}`);
  console.log(`  unknown diagnostic: ${unknown.diagnostics[0].message}`);
  console.log(`  duplicate diagnostic: ${duplicate.diagnostics[0].message}`);
} catch (err) {
  console.error("manifest policy check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
