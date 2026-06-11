#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectManifestRequirementsForEntry,
} from "../dist/manifest_requirements.js";
import {
  formatManifestPolicyForRequirements,
  manifestPolicyFromRequirements,
} from "../dist/manifest_generate.js";
import { parseManifestPolicyText } from "../dist/manifest_policy.js";

const FIXTURE_DIR = "build/manifest_generate";

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

function capabilityList(policy) {
  if (policy.capabilities.length === 0) return "none";
  return policy.capabilities.join(", ");
}

function assertCapabilities(label, capabilities, expected) {
  assert(
    capabilities.join(",") === expected.join(","),
    `${label}: expected '${expected.join(",")}', got '${capabilities.join(",")}'`,
  );
}

try {
  mkdirSync(FIXTURE_DIR, { recursive: true });

  const pureEntry = writeFixture(
    "pure.ts",
    [
      'import { join } from "std/path";',
      "",
      'const out = join("build", "manifest_generate", "pure.txt");',
      "out;",
      "",
    ].join("\n"),
  );
  const effectfulEntry = writeFixture(
    "effectful.ts",
    [
      'import { readFileSync, writeFileSync } from "std/fs";',
      "",
      'const first = readFileSync("input-a.txt", "utf8");',
      'const second = readFileSync("input-b.txt", "utf8");',
      'writeFileSync("build/manifest_generate/out.txt", first + second);',
      "console.log(first);",
      "",
    ].join("\n"),
  );

  const pureRequirements = collectManifestRequirementsForEntry(pureEntry);
  const effectfulRequirements = collectManifestRequirementsForEntry(effectfulEntry);
  const purePolicy = manifestPolicyFromRequirements(pureRequirements);
  const effectfulPolicy = manifestPolicyFromRequirements(effectfulRequirements);
  const pureText = formatManifestPolicyForRequirements(pureRequirements);
  const effectfulText = formatManifestPolicyForRequirements(effectfulRequirements);
  const roundTrip = parseManifestPolicyText(effectfulText);

  const expectedPureText = '{\n  "capabilities": []\n}\n';
  const expectedEffectfulText =
    '{\n' +
    '  "capabilities": [\n' +
    '    "fs.read",\n' +
    '    "fs.write",\n' +
    '    "io.stdout"\n' +
    '  ]\n' +
    '}\n';

  assert(pureRequirements.length === 0, "pure std/path graph produced requirements");
  assert(pureText === expectedPureText, `pure policy text mismatch:\n${pureText}`);
  assertCapabilities("effectful policy", effectfulPolicy.capabilities, ["fs.read", "fs.write", "io.stdout"]);
  assert(effectfulText === expectedEffectfulText, `effectful policy text mismatch:\n${effectfulText}`);
  assert(roundTrip.ok, `round-trip parse failed: ${roundTrip.diagnostics.map((d) => d.message).join(", ")}`);
  assertCapabilities("round-trip policy", roundTrip.policy.capabilities, effectfulPolicy.capabilities);
  assert(effectfulRequirements[0].occurrences.length > 1, "duplicate fs.read provenance was not present");
  assert(
    effectfulPolicy.capabilities.filter((capability) => capability === "fs.read").length === 1,
    "duplicate fs.read capability was rendered",
  );

  console.log("manifest generate ok:");
  console.log(`  pure capabilities: ${capabilityList(purePolicy)}`);
  console.log(`  effectful capabilities: ${capabilityList(effectfulPolicy)}`);
  console.log(`  duplicate fs.read occurrences: ${effectfulRequirements[0].occurrences.length}`);
  console.log(`  round-trip capabilities: ${capabilityList(roundTrip.policy)}`);
} catch (err) {
  console.error("manifest generate check failed:");
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
