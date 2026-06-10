# 0422 - manifest requirements seed

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.4

## Context

ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) fixed the
future user-facing split between `doctor`, `manifest init`, `check`, and
`explain`. ADR [0331](./0331-stdlib-capability-metadata-design.md) fixed
descriptor-backed builtin effect metadata, and ADRs
[0418](./0418-builtin-effect-inventory.md),
[0419](./0419-effect-provenance-collector.md),
[0420](./0420-effect-report-renderer.md), and
[0421](./0421-effect-report-selfhost.md) established the seed vocabulary,
provenance collector, deterministic report, and self-host gate for the report
layers. The missing next internal step is a manifest requirement shape that
future CLI/policy UX can consume without committing this phase to a manifest
file schema or enforcement behavior.

## Decision

Add an internal manifest requirement snapshot that groups descriptor-backed
builtin provenance by effect atom while preserving the full per-occurrence
record. Requirement order follows the seed effect vocabulary
`fs.read`, `fs.metadata`, `fs.write`, `process.argv`, `process.exit`,
`io.stdout`, `io.stderr`, `process.spawn`, then first-seen fallback atoms.
Rejected alternatives: public `doctor` / `check` / `explain` / `manifest init`
commands were rejected as later UX work; manifest schema parsing/writing and
interactive prompts were rejected because this phase only seeds an in-memory
shape; compile-time permission rejection, runtime enforcement, new effect atoms,
function-level effect propagation, loader/package-resolution changes,
runtime/prelude changes, and `Array.sort` support were rejected as out of scope.

## Implementation

- `src/manifest_requirements.ts:1` imports the existing builtin effect and
  provenance types and exposes `ManifestRequirement`.
- `src/manifest_requirements.ts:12` implements
  `collectManifestRequirements(provenance)` as a pure grouping pass.
- `src/manifest_requirements.ts:29` emits groups in fixed seed vocabulary order
  and then appends unknown atoms in first-seen order.
- `src/manifest_requirements.ts:44` exposes
  `collectManifestRequirementsForEntry(entry)` by reusing the existing
  provenance collector.
- `scripts/check-manifest-requirements.mjs:1` creates effectful and pure
  fixtures, checks grouping, no-effect behavior, pure `std/path` exclusion, and
  visible file/line/col occurrence details.
- `package.json:25` exposes `pnpm run check:manifest-requirements`, and
  `tests/smoke.sh:115` adds the smoke gate.

## Consequences

- **Accepted**: future guided manifest generation can consume one effect group
  or one occurrence at a time without rewalking raw provenance.
- **Accepted**: empty provenance and pure graphs produce no manifest
  requirements.
- **Accepted**: zero-config compilation and existing effect report formatting
  remain unchanged.
- **Rejected**: no manifest file is required, read, written, or enforced in this
  phase, and no public CLI command is added.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`,
  `pnpm run check:effect-provenance`, `pnpm run check:effect-report`,
  `pnpm run check:effect-selfhost`,
  `pnpm run check:manifest-requirements`, and `pnpm test`.
