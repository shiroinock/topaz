import { ManifestRequirement } from "./manifest_requirements.js";
import { ManifestPolicy } from "./manifest_policy.js";

export function manifestPolicyFromRequirements(
  requirements: Array<ManifestRequirement>,
): ManifestPolicy {
  const capabilities: Array<string> = [];
  for (const requirement of requirements) {
    if (hasManifestCapability(capabilities, requirement.effect)) continue;
    capabilities.push(requirement.effect);
  }
  return { capabilities };
}

export function formatManifestPolicyText(policy: ManifestPolicy): string {
  const lines: Array<string> = [];
  lines.push("{");
  if (policy.capabilities.length === 0) {
    lines.push('  "capabilities": []');
    lines.push("}");
    return lines.join("\n") + "\n";
  }

  lines.push('  "capabilities": [');
  for (let i = 0; i < policy.capabilities.length; i = i + 1) {
    const suffix = i + 1 === policy.capabilities.length ? "" : ",";
    lines.push('    "' + policy.capabilities[i] + '"' + suffix);
  }
  lines.push("  ]");
  lines.push("}");
  return lines.join("\n") + "\n";
}

export function formatManifestPolicyForRequirements(
  requirements: Array<ManifestRequirement>,
): string {
  return formatManifestPolicyText(manifestPolicyFromRequirements(requirements));
}

function hasManifestCapability(capabilities: Array<string>, capability: string): boolean {
  for (const current of capabilities) {
    if (current === capability) return true;
  }
  return false;
}
