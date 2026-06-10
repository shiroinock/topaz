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
  const occurrencesByEffect = new Map<BuiltinEffect, Array<BuiltinEffectProvenance>>();
  const firstSeenOrder: Array<BuiltinEffect> = [];
  for (const record of provenance) {
    let occurrences = occurrencesByEffect.get(record.effect);
    if (occurrences === undefined) {
      occurrences = [];
      occurrencesByEffect.set(record.effect, occurrences);
      firstSeenOrder.push(record.effect);
    }
    occurrences.push(record);
  }

  const requirements: Array<ManifestRequirement> = [];
  const emitted = new Set<BuiltinEffect>();
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "fs.read");
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "fs.metadata");
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "fs.write");
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "process.argv");
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "process.exit");
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "io.stdout");
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "io.stderr");
  appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, "process.spawn");
  for (const effect of firstSeenOrder) {
    if (emitted.has(effect)) continue;
    appendRequirementIfPresent(requirements, emitted, occurrencesByEffect, effect);
  }
  return requirements;
}

export function collectManifestRequirementsForEntry(entry: string): Array<ManifestRequirement> {
  return collectManifestRequirements(collectBuiltinEffectProvenanceForEntry(entry));
}

function appendRequirementIfPresent(
  requirements: Array<ManifestRequirement>,
  emitted: Set<BuiltinEffect>,
  occurrencesByEffect: Map<BuiltinEffect, Array<BuiltinEffectProvenance>>,
  effect: BuiltinEffect,
): void {
  const occurrences = occurrencesByEffect.get(effect);
  if (occurrences === undefined) return;
  requirements.push({ effect, occurrences });
  emitted.add(effect);
}
