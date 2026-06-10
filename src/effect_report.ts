import path from "node:path";

import {
  BuiltinEffectProvenance,
  collectBuiltinEffectProvenanceForEntry,
} from "./effect_provenance.js";

export function formatBuiltinEffectReport(
  entry: string,
  provenance: Array<BuiltinEffectProvenance>,
): string {
  const lines = [`topaz builtin effect report: ${displayPath(entry)}`];
  if (provenance.length === 0) {
    lines.push("effects: none");
    lines.push("requirements: none");
    return lines.join("\n");
  }

  const effectCounts = new Map<string, number>();
  const effectOrder: Array<string> = [];
  for (const record of provenance) {
    if (!effectCounts.has(record.effect)) {
      effectCounts.set(record.effect, 0);
      effectOrder.push(record.effect);
    }
    effectCounts.set(record.effect, effectCounts.get(record.effect)! + 1);
  }
  effectOrder.sort();

  lines.push("effects:");
  for (const effect of effectOrder) {
    lines.push(`  ${effect}: ${effectCounts.get(effect)}`);
  }

  lines.push("requirements:");
  for (const record of provenance) {
    lines.push(
      `  ${displayPath(record.file)}:${record.line}:${record.col} [${record.effect}] ${record.semanticName} via ${record.source} - ${record.detail}`,
    );
  }
  return lines.join("\n");
}

export function formatBuiltinEffectReportForEntry(entry: string): string {
  return formatBuiltinEffectReport(entry, collectBuiltinEffectProvenanceForEntry(entry));
}

function displayPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  if (relative.length === 0) return ".";
  if (relative.startsWith("..") || path.isAbsolute(relative)) return filePath;
  return relative;
}
