import {
  collectManifestRequirementsForEntry,
  ManifestRequirement,
} from "./manifest_requirements.js";

export function formatDoctorReport(
  entry: string,
  requirements: Array<ManifestRequirement>,
): string {
  const lines = [`topaz doctor report: ${entry}`];
  if (requirements.length === 0) {
    lines.push("capabilities: none");
    lines.push("requirements: none");
    return lines.join("\n");
  }

  lines.push("capabilities:");
  for (const requirement of requirements) {
    lines.push(`  ${requirement.effect}: ${requirement.occurrences.length} occurrence(s)`);
  }

  lines.push("requirements:");
  for (const requirement of requirements) {
    for (const occurrence of requirement.occurrences) {
      const source = doctorSourceLabel(occurrence.source);
      const status = doctorStatusLabel(occurrence.status);
      lines.push(
        `  ${occurrence.file}:${occurrence.line}:${occurrence.col} ` +
          `[${occurrence.effect}] ${occurrence.semanticName} ` +
          `via ${source} ${status} - ${occurrence.detail}`,
      );
    }
  }
  return lines.join("\n");
}

export function formatDoctorReportForEntry(entry: string): string {
  return formatDoctorReport(entry, collectManifestRequirementsForEntry(entry));
}

function doctorSourceLabel(source: "import" | "call" | "value"): string {
  if (source === "import") return "import";
  if (source === "call") return "call";
  return "value";
}

function doctorStatusLabel(status: "public" | "compat" | "synthetic_compat"): string {
  if (status === "public") return "public";
  if (status === "compat") return "compat";
  return "synthetic_compat";
}
