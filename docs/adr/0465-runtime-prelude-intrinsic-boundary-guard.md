# 0465 - runtime prelude intrinsic boundary guard

- **Status**: Accepted
- **Date**: 2026-06-11
- **Phase**: 4.46

## Context

Phase 4.45 fixed the remaining `runtime/runtime.h` substrate count with a
normal smoke saturation guard, but the active `StringBuffer` and `BigIntBuffer`
substrate families have a second boundary: their pseudo types and
`__topaz_*` intrinsic calls are compiler-owned affordances for
`runtime/prelude.ts`, not public Topaz source. ADR
[0464](./0464-runtime-substrate-saturation-guard.md) guards the C surface
count; it does not by itself prove that the internal prelude access boundary
stays narrow.

## Decision

Add a normal smoke-level static contract for the runtime prelude intrinsic
boundary. The contract checks representative codegen evidence that internal
StringBuffer and BigIntBuffer intrinsic handling remains behind
`isCompilingRuntimePrelude()`, representative prelude evidence that both
families remain active clients, existing hidden-helper fail cases for user
source, and migration-doc evidence that the families remain active substrate
lanes rather than reopened legacy `needs-*` lanes.

Rejected alternatives: removing the corresponding C helpers from
`runtime/runtime.h` would be runtime migration work; exposing the pseudo types
or helpers to user source would expand the public language surface; coupling
the guard to generated C line numbers would be brittle; broad backend,
container, number, or exception design docs would exceed this boundary-only
phase.

## Implementation

- `tests/smoke.sh:981` adds `runtime_prelude_intrinsic_boundary_guard`, a
  static text contract over `src/codegen.ts`, `runtime/prelude.ts`, existing
  hidden-helper smoke entries, and `docs/runtime-ts-migration.md`.
- `docs/runtime-ts-migration.md:251` records Phase 4.46 as a separate guard
  from the 56-symbol `runtime/runtime.h` saturation count.
- `MEMO.md:379` records the checked Phase 4.46 roadmap line.

## Consequences

- **Accepted**: future runtime work has two independent guardrails:
  runtime-header symbol/lane saturation and prelude-only intrinsic access.
- **Accepted**: moving either boundary now requires its own runtime migration,
  backend, intrinsic, or substrate ADR.
- **Rejected**: runtime behavior, `runtime/runtime.h`, `runtime/prelude.ts`,
  generated runtime files, codegen behavior, release tags, and GitHub Release
  state are unchanged.
- **Regression**: `pnpm run check:runtime-prelude`,
  `pnpm run check:runtime-header`,
  `pnpm run check:runtime-substrate -- --details`, `pnpm run build`, and
  `pnpm test`.
