import { builtinEffectVocabulary } from "./builtin_descriptors.js";

export type ManifestPolicy = {
  capabilities: Array<string>;
};

export type ManifestPolicyDiagnostic = {
  kind: string;
  capability: string;
  message: string;
};

export type ManifestPolicyValidationResult = {
  ok: boolean;
  policy: ManifestPolicy;
  diagnostics: Array<ManifestPolicyDiagnostic>;
};

export function manifestPolicyFilename(): string {
  return "strict-ts.json";
}

export function emptyManifestPolicy(): ManifestPolicy {
  return { capabilities: [] };
}

export function validateManifestPolicyCapabilities(
  capabilities: Array<string>,
): ManifestPolicyValidationResult {
  const diagnostics: Array<ManifestPolicyDiagnostic> = [];
  const acceptedCapabilities: Array<string> = [];
  const knownCapabilities = builtinEffectVocabulary();

  for (const capability of capabilities) {
    if (!hasString(knownCapabilities, capability)) {
      diagnostics.push({
        kind: "unknown-capability",
        capability,
        message: "unknown capability '" + capability + "'",
      });
    }

    if (hasString(acceptedCapabilities, capability)) {
      diagnostics.push({
        kind: "duplicate-capability",
        capability,
        message: "duplicate capability '" + capability + "'",
      });
    } else {
      acceptedCapabilities.push(capability);
    }
  }

  return {
    ok: diagnostics.length === 0,
    policy: { capabilities: acceptedCapabilities },
    diagnostics,
  };
}

function hasString(values: Array<string>, value: string): boolean {
  for (const current of values) {
    if (current === value) return true;
  }
  return false;
}
