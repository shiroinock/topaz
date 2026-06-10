import {
  BuiltinEffectProvenance,
  collectBuiltinEffectProvenanceForEntry,
} from "./effect_provenance.js";

export function formatBuiltinEffectReport(
  entry: string,
  provenance: Array<BuiltinEffectProvenance>,
): string {
  const lines = [`topaz builtin effect report: ${entry}`];
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

  lines.push("effects:");
  appendEffectSummaryLines(lines, effectCounts, effectOrder);

  lines.push("requirements:");
  for (const record of provenance) {
    const source = effectSourceLabel(record.source);
    lines.push(
      `  ${record.file}:${record.line}:${record.col} [${record.effect}] ${record.semanticName} via ${source} - ${record.detail}`,
    );
  }
  return lines.join("\n");
}

export function formatBuiltinEffectReportForEntry(entry: string): string {
  return formatBuiltinEffectReport(entry, collectBuiltinEffectProvenanceForEntry(entry));
}

function appendEffectSummaryLines(
  lines: Array<string>,
  effectCounts: Map<string, number>,
  effectOrder: Array<string>,
): void {
  const effectSummaryOrder = [
    "fs.read",
    "fs.metadata",
    "fs.write",
    "process.argv",
    "process.exit",
    "io.stdout",
    "io.stderr",
    "process.spawn",
  ];
  const emitted = new Set<string>();
  for (const effect of effectSummaryOrder) {
    const count = effectCounts.get(effect);
    if (count === undefined) continue;
    lines.push(`  ${effect}: ${count}`);
    emitted.add(effect);
  }
  for (const effect of effectOrder) {
    if (emitted.has(effect)) continue;
    const count = effectCounts.get(effect);
    if (count === undefined) continue;
    lines.push(`  ${effect}: ${count}`);
  }
}

function effectSourceLabel(source: "import" | "call" | "value"): string {
  if (source === "import") return "import";
  if (source === "call") return "call";
  return "value";
}
