# 0425 - doctor report self-host

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.7

## Context

Phase 4.6 / ADR [0424](./0424-doctor-report-renderer.md) added the internal
doctor diagnostic renderer over manifest requirements. The renderer is now part
of the v0.2 internal manifest/doctor pipeline and should not regress the
compiler's ability to compile its own diagnostic layers. The self-host scout
found the immediate blocker in `src/doctor_report.ts`: template literal
substitution of literal-union `occurrence.source` and `occurrence.status` is
outside the current Topaz subset.

## Decision

Keep `formatDoctorReport(entry, requirements)` and
`formatDoctorReportForEntry(entry)` stable, and keep the rendered doctor text
compatible with Phase 4.6. Convert the literal-union source and status values
through explicit string label helpers before interpolating them into the report.
Add a dedicated doctor self-host checker and smoke gate that emit
`src/doctor_report.ts` to C and object-compile it. Rejected alternatives:
expanding template literal union interpolation in codegen, adding public
`doctor` / `check` / `explain` / `manifest init` commands, manifest schema or
policy work, runtime enforcement, provenance changes, descriptor metadata
changes, loader/package lookup changes, and runtime/prelude/header changes are
outside this phase.

## Implementation

- `src/doctor_report.ts:25` now converts occurrence `source` and `status`
  through label helpers before building requirement lines.
- `src/doctor_report.ts:41` adds `doctorSourceLabel` for import/call/value
  literal-union values.
- `src/doctor_report.ts:47` adds `doctorStatusLabel` for
  public/compat/synthetic_compat status values.
- `scripts/check-doctor-selfhost.mjs:1` emits `src/doctor_report.ts` with
  Topaz and compiles `build/doctor_selfhost/doctor_report.c` to an object using
  `cc -O2 -Iruntime -Wall -Wextra -c`.
- `package.json:28` exposes `pnpm run check:doctor-selfhost`, and
  `tests/smoke.sh:183` asserts the checker summary, target path, former blocker
  text, and `PASS [doctor_selfhost]`.
- `MEMO.md:339` records the Phase 4.7 doctor report self-host checkpoint.

## Consequences

- **Accepted**: the doctor diagnostic layer joins the effect report and
  manifest requirement layers as self-hostable internal infrastructure.
- **Accepted**: report output and public internal API remain stable for later
  public `topaz doctor` work.
- **Accepted**: the TypeScript subset boundary remains unchanged; literal union
  template interpolation is still not broadened.
- **Rejected**: public CLI commands, manifest policy/schema, permission
  enforcement, sandboxing, provenance collection changes, and lowering changes
  remain future work.
- **Regression**: `pnpm run build`, `pnpm run check:builtin-effects`,
  `pnpm run check:effect-provenance`, `pnpm run check:effect-report`,
  `pnpm run check:effect-selfhost`,
  `pnpm run check:manifest-requirements`,
  `pnpm run check:manifest-selfhost`, `pnpm run check:doctor-report`,
  `pnpm run check:doctor-selfhost`, `pnpm run check:runtime-substrate`, and
  `pnpm test`.
