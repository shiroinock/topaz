import { BuiltinEffect } from "./builtin_descriptors.js";
import {
  BuiltinEffectProvenance,
  collectBuiltinEffectProvenanceForEntry,
} from "./effect_provenance.js";

export type ManifestRequirement = {
  effect: BuiltinEffect;
  occurrences: Array<BuiltinEffectProvenance>;
};

export function collectManifestRequirements(
  provenance: Array<BuiltinEffectProvenance>,
): Array<ManifestRequirement> {
  const grouped: Array<ManifestRequirement> = [];
  for (const record of provenance) {
    const requirement = findRequirement(grouped, record.effect);
    if (requirement === undefined) {
      const newRequirement: ManifestRequirement = { effect: record.effect, occurrences: [] };
      grouped.push(newRequirement);
      newRequirement.occurrences.push(record);
    } else {
      requirement.occurrences.push(record);
    }
  }

  return orderManifestRequirements(grouped);
}

export function collectManifestRequirementsForEntry(entry: string): Array<ManifestRequirement> {
  return collectManifestRequirements(collectBuiltinEffectProvenanceForEntry(entry));
}

function orderManifestRequirements(grouped: Array<ManifestRequirement>): Array<ManifestRequirement> {
  const requirements: Array<ManifestRequirement> = [];
  appendRequirementIfPresent(requirements, grouped, "fs.read");
  appendRequirementIfPresent(requirements, grouped, "fs.metadata");
  appendRequirementIfPresent(requirements, grouped, "fs.write");
  appendRequirementIfPresent(requirements, grouped, "process.argv");
  appendRequirementIfPresent(requirements, grouped, "process.exit");
  appendRequirementIfPresent(requirements, grouped, "io.stdout");
  appendRequirementIfPresent(requirements, grouped, "io.stderr");
  appendRequirementIfPresent(requirements, grouped, "process.spawn");
  for (const requirement of grouped) {
    if (hasRequirement(requirements, requirement.effect)) continue;
    requirements.push(requirement);
  }
  return requirements;
}

function findRequirement(
  requirements: Array<ManifestRequirement>,
  effect: BuiltinEffect,
): ManifestRequirement | undefined {
  for (const requirement of requirements) {
    if (requirement.effect === effect) return requirement;
  }
  return undefined;
}

function hasRequirement(requirements: Array<ManifestRequirement>, effect: BuiltinEffect): boolean {
  return findRequirement(requirements, effect) !== undefined;
}

function appendRequirementIfPresent(
  requirements: Array<ManifestRequirement>,
  grouped: Array<ManifestRequirement>,
  effect: BuiltinEffect,
): void {
  const requirement = findRequirement(grouped, effect);
  if (requirement === undefined) return;
  if (hasRequirement(requirements, effect)) return;
  requirements.push(requirement);
}
