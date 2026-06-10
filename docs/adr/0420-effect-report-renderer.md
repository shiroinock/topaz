# 0420 - effect report renderer

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.2

## Context

Phase 4.0 / ADR [0418](./0418-builtin-effect-inventory.md) pinned the builtin
effect vocabulary, and Phase 4.1 / ADR
[0419](./0419-effect-provenance-collector.md) collected descriptor-backed
source provenance. ADR
[0330](./0330-manifest-doctor-capability-guidance-design.md) still needs future
doctor/check/explain UX to show concrete file:line provenance, but public
commands and manifest policy are not ready for this phase.

## Decision

Add a deterministic internal report renderer over
`BuiltinEffectProvenance[]`. It keeps the Phase 4.1 collector as the source of
truth, adds only presentation, summarizes effect atoms, preserves source
traversal order for requirement details, and renders no-effect graphs
explicitly. Rejected alternatives: public `topaz doctor` / `check` / `explain`
commands were rejected because command shape is a later UX decision; manifest
schema or permission policy was rejected because this phase remains
non-enforcing; broad function effect propagation was rejected because this
renderer only formats builtin provenance records.

## Implementation

- `src/effect_report.ts:1` exports `formatBuiltinEffectReport(entry,
  provenance)` and `formatBuiltinEffectReportForEntry(entry)`.
- `src/effect_report.ts:10` renders the stable heading and no-effect contract
  as `effects: none` plus `requirements: none`.
- `src/effect_report.ts:18` counts records by effect atom and sorts summary
  atoms for deterministic output independent of first occurrence.
- `src/effect_report.ts:33` renders each requirement as
  `file:line:col [effect] semanticName via source - detail` while preserving
  the provenance record order.
- `scripts/check-effect-report.mjs:1` writes temporary fixtures under
  `build/effect_report/`, imports the built JS API, and asserts the report
  contract.
- `package.json:23` exposes `pnpm run check:effect-report`, and
  `tests/smoke.sh:80` runs it as part of the smoke suite.
- `MEMO.md:334` records Phase 4.2 as the internal report-rendering layer.

## Consequences

- **Accepted**: future doctor/check/explain commands can reuse one stable
  internal text report instead of reformatting raw provenance independently.
- **Accepted**: smoke now checks effect summaries for `fs.read`, `fs.write`,
  `process.argv`, `io.stdout`, and `io.stderr`.
- **Accepted**: no-effect source graphs render an explicit empty report rather
  than an empty section.
- **Rejected**: pure `std/path` imports/calls still produce no report
  requirements.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`,
  `pnpm run check:effect-provenance`, `pnpm run check:effect-report`, and
  `pnpm test`.
- **Scope外**: public CLI commands, manifest parsing/writing, compile-time
  permission rejection, runtime permission enforcement, runtime header changes,
  new effect atoms, descriptor vocabulary changes, and user-defined function
  effect propagation remain future v0.2 work.
