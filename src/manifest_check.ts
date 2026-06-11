import {
  ManifestRequirement,
  collectManifestRequirementsForEntry,
} from "./manifest_requirements.js";
import {
  ManifestPolicyDiagnostic,
  ManifestPolicyFileLoadResult,
  loadManifestPolicyFile,
} from "./manifest_policy.js";

export type ManifestCheckIssue = {
  capability: string;
  occurrences: number;
};

export type ManifestCheckResult = {
  entry: string;
  policyPath: string;
  policyFound: boolean;
  policyValid: boolean;
  requirements: Array<ManifestRequirement>;
  missing: Array<ManifestCheckIssue>;
  policyDiagnostics: Array<ManifestPolicyDiagnostic>;
  ok: boolean;
};

export function checkManifestPolicy(
  entry: string,
  requirements: Array<ManifestRequirement>,
  loaded: ManifestPolicyFileLoadResult,
): ManifestCheckResult {
  const missing: Array<ManifestCheckIssue> = [];
  const capabilities = loaded.result.policy.capabilities;

  for (const requirement of requirements) {
    if (hasManifestCapability(capabilities, requirement.effect)) continue;
    missing.push({
      capability: requirement.effect,
      occurrences: requirement.occurrences.length,
    });
  }

  return {
    entry,
    policyPath: loaded.path,
    policyFound: loaded.found,
    policyValid: loaded.result.ok,
    requirements,
    missing,
    policyDiagnostics: loaded.result.diagnostics,
    ok: loaded.result.ok && missing.length === 0,
  };
}

export function checkManifestPolicyForEntry(entry: string, policyPath: string): ManifestCheckResult {
  return checkManifestPolicy(
    entry,
    collectManifestRequirementsForEntry(entry),
    loadManifestPolicyFile(policyPath),
  );
}

export function formatManifestCheckReport(result: ManifestCheckResult): string {
  const lines: Array<string> = [];
  lines.push("topaz check report: " + result.entry);
  lines.push("policy: " + result.policyPath + " (" + policyFoundLabel(result.policyFound) + ")");

  if (result.policyDiagnostics.length !== 0) {
    lines.push("policy diagnostics:");
    for (const diagnostic of result.policyDiagnostics) {
      lines.push("  " + diagnostic.message);
    }
  }

  if (result.missing.length === 0) {
    lines.push("missing capabilities: none");
  } else {
    lines.push("missing capabilities:");
    for (const issue of result.missing) {
      lines.push("  " + issue.capability + ": " + issue.occurrences.toString() + " occurrence(s)");
    }
  }

  lines.push("status: " + statusLabel(result.ok));
  return lines.join("\n");
}

function hasManifestCapability(capabilities: Array<string>, capability: string): boolean {
  for (const current of capabilities) {
    if (current === capability) return true;
  }
  return false;
}

function policyFoundLabel(found: boolean): string {
  if (found) return "found";
  return "missing";
}

function statusLabel(ok: boolean): string {
  if (ok) return "ok";
  return "failed";
}
