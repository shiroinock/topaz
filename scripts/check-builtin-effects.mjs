#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";

const descriptorModulePath = process.argv[2] ?? "dist/builtin_descriptors.js";

const EFFECT_VOCABULARY = [
  "fs.read",
  "fs.metadata",
  "fs.write",
  "process.argv",
  "process.exit",
  "io.stdout",
  "io.stderr",
  "process.spawn",
];

const KNOWN_STATUSES = ["public", "compat", "synthetic_compat"];
const PURE_SPECIFIERS = ["node:path", "std/path", "node:url"];
const PURE_PREFIXES = ["path.", "url."];
const PURE_GLOBALS = ["import.meta.url"];

function moduleUrl(modulePath) {
  if (modulePath.startsWith("file:")) return modulePath;
  return pathToFileURL(path.resolve(modulePath)).href;
}

function descriptorIdentity(desc) {
  if (desc.kind === "import") {
    return `import:${desc.specifier}:${desc.importedName}`;
  }
  if (desc.kind === "synthetic_global") {
    return `synthetic:${desc.globalName}`;
  }
  return `unknown:${desc.semanticName ?? "<missing>"}`;
}

function requiresEffects(desc) {
  if (typeof desc.semanticName !== "string") return false;
  if (desc.semanticName.startsWith("fs.")) return true;
  if (desc.semanticName.startsWith("process.")) return true;
  return desc.semanticName === "console.log" || desc.semanticName === "console.error";
}

function mustRemainPure(desc) {
  if (PURE_SPECIFIERS.includes(desc.specifier)) return true;
  if (PURE_GLOBALS.includes(desc.globalName)) return true;
  if (typeof desc.semanticName !== "string") return false;
  if (PURE_GLOBALS.includes(desc.semanticName)) return true;
  for (const prefix of PURE_PREFIXES) {
    if (desc.semanticName.startsWith(prefix)) return true;
  }
  return false;
}

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function validateDescriptors(descriptors) {
  const errors = [];
  const identities = new Set();
  const effectCounts = new Map();
  const statusCounts = new Map();
  let pureCount = 0;

  if (!Array.isArray(descriptors)) {
    errors.push("builtinDescriptors() must return an array");
    return { errors, effectCounts, statusCounts, pureCount };
  }

  for (const desc of descriptors) {
    const identity = descriptorIdentity(desc);
    if (identities.has(identity)) {
      errors.push(`${identity}: duplicate descriptor identity`);
    }
    identities.add(identity);

    if (typeof desc.semanticName !== "string" || desc.semanticName.trim().length === 0) {
      errors.push(`${identity}: empty semanticName`);
    }
    if (typeof desc.explanation !== "string" || desc.explanation.trim().length === 0) {
      errors.push(`${identity}: empty explanation`);
    }
    if (!KNOWN_STATUSES.includes(desc.status)) {
      errors.push(`${identity}: unknown status '${String(desc.status)}'`);
    } else {
      increment(statusCounts, desc.status);
    }
    if (!Array.isArray(desc.effects)) {
      errors.push(`${identity}: effects must be an array`);
      continue;
    }
    if (requiresEffects(desc) && desc.effects.length === 0) {
      errors.push(`${identity}: missing required effect for ${desc.semanticName}`);
    }
    if (mustRemainPure(desc) && desc.effects.length !== 0) {
      errors.push(`${identity}: ${desc.semanticName} must remain pure for v0.2 seed inventory`);
    }
    if (desc.effects.length === 0) {
      pureCount += 1;
    }
    for (const effect of desc.effects) {
      if (typeof effect !== "string" || effect.trim().length === 0) {
        errors.push(`${identity}: empty effect string`);
        continue;
      }
      if (!EFFECT_VOCABULARY.includes(effect)) {
        errors.push(`${identity}: unknown effect '${effect}'`);
        continue;
      }
      increment(effectCounts, effect);
    }
  }

  return { errors, effectCounts, statusCounts, pureCount };
}

async function main() {
  const mod = await import(moduleUrl(descriptorModulePath));
  if (typeof mod.builtinDescriptors !== "function") {
    throw new Error(`${descriptorModulePath} does not export builtinDescriptors()`);
  }

  const descriptors = mod.builtinDescriptors();
  const { errors, effectCounts, statusCounts, pureCount } = validateDescriptors(descriptors);
  if (errors.length !== 0) {
    console.error("builtin effect inventory failed:");
    for (const error of errors) {
      console.error(`  ${error}`);
    }
    process.exit(1);
  }

  console.log(`builtin effect inventory ok: ${descriptors.length} descriptors`);
  console.log("effect capabilities:");
  for (const effect of EFFECT_VOCABULARY) {
    console.log(`  ${effect}: ${effectCounts.get(effect) ?? 0}`);
  }
  console.log(`pure builtin descriptors: ${pureCount}`);
  console.log("statuses:");
  for (const status of KNOWN_STATUSES) {
    console.log(`  ${status}: ${statusCounts.get(status) ?? 0}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
