import {
  BuiltinDescriptor,
  BuiltinEffect,
  builtinDescriptors,
  builtinEffectDescription,
  builtinEffectVocabulary,
} from "./builtin_descriptors.js";

export function knownCapabilityNames(): Array<BuiltinEffect> {
  const names: Array<BuiltinEffect> = [];
  for (const effect of builtinEffectVocabulary()) {
    if (descriptorsForCapability(effect).length !== 0) names.push(effect);
  }
  return names;
}

export function formatCapabilityExplanation(name: string): string | undefined {
  const descriptors = descriptorsForCapability(name);
  if (descriptors.length === 0) return undefined;

  const lines = [
    `topaz capability: ${name}`,
    `description: ${builtinEffectDescription(name)}`,
    "apis:",
  ];
  for (const desc of orderedCapabilityDescriptors(descriptors)) {
    const source = descriptorSourceLabel(desc);
    const status = descriptorStatusLabel(desc.status);
    lines.push(`  - ${source}`);
    lines.push(`    semantic: ${desc.semanticName}`);
    lines.push(`    status: ${status}`);
    lines.push(`    explanation: ${desc.explanation}`);
  }
  return lines.join("\n");
}

function descriptorsForCapability(effect: BuiltinEffect): Array<BuiltinDescriptor> {
  const out: Array<BuiltinDescriptor> = [];
  for (const desc of builtinDescriptors()) {
    if (descriptorHasEffect(desc, effect)) out.push(desc);
  }
  return out;
}

function descriptorHasEffect(desc: BuiltinDescriptor, effect: BuiltinEffect): boolean {
  for (const candidate of desc.effects) {
    if (candidate === effect) return true;
  }
  return false;
}

function orderedCapabilityDescriptors(descriptors: Array<BuiltinDescriptor>): Array<BuiltinDescriptor> {
  const out: Array<BuiltinDescriptor> = [];
  appendDescriptorsWithStatus(out, descriptors, "public");
  appendDescriptorsWithStatus(out, descriptors, "compat");
  appendDescriptorsWithStatus(out, descriptors, "synthetic_compat");
  return out;
}

function appendDescriptorsWithStatus(
  out: Array<BuiltinDescriptor>,
  descriptors: Array<BuiltinDescriptor>,
  status: string,
): void {
  for (const desc of descriptors) {
    if (desc.status === status) out.push(desc);
  }
}

function descriptorSourceLabel(desc: BuiltinDescriptor): string {
  if (desc.kind === "import") return `${desc.specifier}.${desc.importedName}`;
  return `synthetic ${desc.globalName}`;
}

function descriptorStatusLabel(status: "public" | "compat" | "synthetic_compat"): string {
  if (status === "public") return "public";
  if (status === "compat") return "compat";
  return "synthetic_compat";
}
