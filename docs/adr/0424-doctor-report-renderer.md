# 0424 - doctor report renderer

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.6

## Context

ADR [0330](./0330-manifest-doctor-capability-guidance-design.md) fixed the
future read-only `doctor` workflow separately from write-capable
`manifest init`, policy `check`, and documentation `explain`. ADRs
[0419](./0419-effect-provenance-collector.md) through
[0423](./0423-manifest-requirements-selfhost.md) built descriptor-backed
provenance, deterministic reports, and self-hostable manifest requirement
grouping. The next internal step is a doctor-facing renderer that can be reused
by public CLI work later without adding a command in this phase.

## Decision

Add an internal doctor diagnostic renderer over `ManifestRequirement[]`. The
renderer keeps the manifest requirement snapshot as the source of truth, emits a
stable `topaz doctor report: <entry>` heading, summarizes capabilities in the
existing manifest requirement order, and preserves source provenance on each
occurrence. Rejected alternatives: adding public `topaz doctor`, `topaz check`,
`topaz explain`, or `topaz manifest init` commands was rejected as later UX
work; manifest schema parsing/writing, prompts, policy grants, compile-time
permission rejection, runtime sandboxing, new effect atoms, transitive function
effect inference, loader/package lookup changes, runtime/prelude/header
changes, builtin descriptor changes, and codegen lowering changes remain out of
scope.

## Implementation

- `src/doctor_report.ts:1` imports the manifest requirement API and exposes
  `formatDoctorReport(entry, requirements)`.
- `src/doctor_report.ts:8` renders the stable doctor heading and the empty
  contract as `capabilities: none` plus `requirements: none`.
- `src/doctor_report.ts:16` renders capability summary lines in manifest
  requirement order with occurrence counts.
- `src/doctor_report.ts:21` renders each occurrence with file, line, column,
  effect atom, semantic name, source label, status, and detail.
- `src/doctor_report.ts:32` exposes `formatDoctorReportForEntry(entry)` by
  collecting manifest requirements for the entry.
- `scripts/check-doctor-report.mjs:1` writes effectful and pure fixtures under
  `build/doctor_report/`, imports the built JS API, and asserts the doctor
  report contract.
- `package.json:27` exposes `pnpm run check:doctor-report`, and
  `tests/smoke.sh:144` adds the smoke gate.
- `MEMO.md:338` records Phase 4.6 as the internal doctor diagnostic renderer.

## Consequences

- **Accepted**: future `topaz doctor <entry.ts>` can reuse one tested internal
  text surface over manifest requirements.
- **Accepted**: zero-config compilation remains unchanged, and no manifest file
  is read, written, or enforced.
- **Accepted**: pure `std/path` imports/calls still produce no doctor
  diagnostics.
- **Rejected**: manifest generation/check/explain, public CLI shape, permission
  enforcement, runtime sandboxing, and broad function effect propagation remain
  future work.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`,
  `pnpm run check:effect-provenance`, `pnpm run check:effect-report`,
  `pnpm run check:effect-selfhost`,
  `pnpm run check:manifest-requirements`,
  `pnpm run check:manifest-selfhost`, `pnpm run check:doctor-report`,
  `pnpm run check:runtime-substrate`, and `pnpm test`.
